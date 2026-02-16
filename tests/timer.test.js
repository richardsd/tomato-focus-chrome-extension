import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACTIONS } from '../src/shared/runtimeActions.js';

const mocks = vi.hoisted(() => ({
    statistics: {
        getStatistics: vi.fn(),
        incrementCompleted: vi.fn(),
        addFocusTime: vi.fn(),
        clearAll: vi.fn(),
        getAllStatistics: vi.fn(),
    },
    tasks: {
        getTasks: vi.fn(),
        incrementTaskPomodoros: vi.fn(),
        createTask: vi.fn(),
        updateTask: vi.fn(),
        deleteTask: vi.fn(),
        completeTasks: vi.fn(),
        deleteTasks: vi.fn(),
        clearCompletedTasks: vi.fn(),
    },
    notifications: {
        checkPermissions: vi.fn(),
        show: vi.fn(),
    },
    storage: {
        loadState: vi.fn(),
        applySavedState: vi.fn(),
        saveState: vi.fn(),
    },
    jiraInstance: {
        configureAlarm: vi.fn(),
        performJiraSync: vi.fn(),
    },
    JiraSyncManager: vi.fn(),
}));

mocks.JiraSyncManager.mockImplementation(() => mocks.jiraInstance);

vi.mock('../src/background/statistics.js', () => ({
    StatisticsManager: mocks.statistics,
}));

vi.mock('../src/background/tasks.js', () => ({
    TaskManager: mocks.tasks,
}));

vi.mock('../src/background/notifications.js', () => ({
    NotificationManager: mocks.notifications,
}));

vi.mock('../src/background/contextMenus.js', () => ({
    ContextMenuManager: {
        create: vi.fn(),
        update: vi.fn(),
    },
}));

vi.mock('../src/background/badge.js', () => ({
    BadgeManager: {
        update: vi.fn(),
    },
}));

vi.mock('../src/background/storageManager.js', () => ({
    StorageManager: mocks.storage,
}));

vi.mock('../src/background/jiraSync.js', () => ({
    JiraSyncManager: mocks.JiraSyncManager,
}));

const createController = async () => {
    const { TimerController } = await import('../src/background/timer.js');
    const controller = new TimerController();
    await controller.init();
    return controller;
};

const primeChromeMocks = () => {
    chrome.runtime.sendMessage.mockReturnValue(Promise.resolve());
    chrome.idle.onStateChanged = {
        addListener: vi.fn(),
        removeListener: vi.fn(),
    };
    chrome.alarms.clear.mockResolvedValue(true);
    chrome.alarms.create.mockResolvedValue();
};

describe('TimerState behavior via TimerController.state', () => {
    beforeEach(() => {
        mocks.JiraSyncManager.mockImplementation(() => mocks.jiraInstance);
        primeChromeMocks();
        mocks.storage.loadState.mockResolvedValue(null);
        mocks.storage.applySavedState.mockReturnValue(false);
        mocks.storage.saveState.mockResolvedValue();
        mocks.statistics.getStatistics.mockResolvedValue({
            completedPomodoros: 0,
        });
        mocks.tasks.getTasks.mockResolvedValue([]);
        mocks.jiraInstance.configureAlarm.mockResolvedValue();
        mocks.notifications.show.mockResolvedValue();
    });

    it('resets to default values and can start work/short/long sessions', async () => {
        const controller = await createController();

        controller.state.currentSession = 4;
        controller.state.timeLeft = 1;
        controller.state.isWorkSession = false;

        controller.state.reset();
        expect(controller.state.currentSession).toBe(1);
        expect(controller.state.isWorkSession).toBe(true);
        expect(controller.state.timeLeft).toBe(25 * 60);

        controller.state.startShortBreak();
        expect(controller.state.timeLeft).toBe(
            controller.state.settings.shortBreak * 60
        );

        controller.state.startLongBreak();
        expect(controller.state.timeLeft).toBe(
            controller.state.settings.longBreak * 60
        );

        controller.state.startWork();
        expect(controller.state.timeLeft).toBe(
            controller.state.settings.workDuration * 60
        );
        expect(controller.state.isWorkSession).toBe(true);
    });

    it('computes shouldTakeLongBreak from currentSession and interval', async () => {
        const controller = await createController();
        controller.state.settings.longBreakInterval = 3;

        controller.state.currentSession = 3;
        expect(controller.state.shouldTakeLongBreak()).toBe(true);

        controller.state.currentSession = 4;
        expect(controller.state.shouldTakeLongBreak()).toBe(false);
    });
});

describe('TimerController flow behavior', () => {
    beforeEach(() => {
        mocks.JiraSyncManager.mockImplementation(() => mocks.jiraInstance);
        vi.clearAllMocks();
        primeChromeMocks();
        mocks.storage.loadState.mockResolvedValue(null);
        mocks.storage.applySavedState.mockReturnValue(false);
        mocks.storage.saveState.mockResolvedValue();
        mocks.statistics.getStatistics.mockResolvedValue({
            completedPomodoros: 5,
        });
        mocks.statistics.incrementCompleted.mockResolvedValue();
        mocks.statistics.addFocusTime.mockResolvedValue();
        mocks.tasks.getTasks.mockResolvedValue([{ id: 'task-1', title: 'A' }]);
        mocks.tasks.incrementTaskPomodoros.mockResolvedValue();
        mocks.jiraInstance.configureAlarm.mockResolvedValue();
        mocks.notifications.show.mockResolvedValue();
    });

    it('start/pause/reset/toggle/skipBreak/startQuickTimer update alarms and state', async () => {
        const controller = await createController();

        await controller.start();
        expect(controller.state.isRunning).toBe(true);

        await controller.pause();
        expect(controller.state.isRunning).toBe(false);

        await controller.reset();
        expect(controller.state.currentSession).toBe(1);
        expect(controller.state.timeLeft).toBe(
            controller.state.settings.workDuration * 60
        );

        await controller.toggle();
        expect(controller.state.isRunning).toBe(true);
        await controller.toggle();
        expect(controller.state.isRunning).toBe(false);

        controller.state.isWorkSession = false;
        controller.state.settings.autoStart = true;
        const scheduleSpy = vi.spyOn(controller, 'scheduleAlarm');
        await controller.skipBreak();
        expect(controller.state.isWorkSession).toBe(true);
        expect(scheduleSpy).toHaveBeenCalled();

        await controller.startQuickTimer(15);
        expect(controller.state.timeLeft).toBe(15 * 60);
    });

    it('onTimerComplete updates statistics/tasks, changes session type, and auto-starts', async () => {
        const controller = await createController();
        controller.state.isWorkSession = true;
        controller.state.currentSession = 4;
        controller.state.currentTaskId = 'task-1';
        controller.state.settings.longBreakInterval = 4;
        controller.state.settings.autoStart = true;

        const scheduleSpy = vi.spyOn(controller, 'scheduleAlarm');

        await controller.onTimerComplete();

        expect(mocks.statistics.incrementCompleted).toHaveBeenCalled();
        expect(mocks.statistics.addFocusTime).toHaveBeenCalledWith(
            controller.state.settings.workDuration
        );
        expect(mocks.tasks.incrementTaskPomodoros).toHaveBeenCalledWith(
            'task-1'
        );
        expect(controller.state.isWorkSession).toBe(false);
        expect(controller.state.timeLeft).toBe(
            controller.state.settings.longBreak * 60
        );
        expect(controller.state.isRunning).toBe(true);
        expect(scheduleSpy).toHaveBeenCalled();
        expect(mocks.notifications.show).toHaveBeenCalled();
    });

    it('onTimerComplete from break increments session and stops when auto-start disabled', async () => {
        const controller = await createController();
        controller.state.isWorkSession = false;
        controller.state.currentSession = 2;
        controller.state.settings.autoStart = false;

        await controller.onTimerComplete();

        expect(controller.state.currentSession).toBe(3);
        expect(controller.state.isWorkSession).toBe(true);
        expect(controller.state.isRunning).toBe(false);
        expect(controller.state.endTime).toBeNull();
    });
});

describe('TimerController.handleMessage', () => {
    beforeEach(() => {
        mocks.JiraSyncManager.mockImplementation(() => mocks.jiraInstance);
        vi.clearAllMocks();
        primeChromeMocks();
        mocks.storage.loadState.mockResolvedValue(null);
        mocks.storage.applySavedState.mockReturnValue(false);
        mocks.storage.saveState.mockResolvedValue();
        mocks.statistics.getStatistics.mockResolvedValue({
            completedPomodoros: 1,
        });
        mocks.statistics.getAllStatistics.mockResolvedValue([
            { date: '2025-01-01' },
        ]);
        mocks.statistics.clearAll.mockResolvedValue();
        mocks.tasks.getTasks.mockResolvedValue([
            { id: '1', title: 'Task 1', isCompleted: false },
        ]);
        mocks.tasks.createTask.mockResolvedValue();
        mocks.tasks.updateTask.mockResolvedValue();
        mocks.tasks.deleteTask.mockResolvedValue();
        mocks.tasks.completeTasks.mockResolvedValue([
            { id: '2', isCompleted: true },
        ]);
        mocks.tasks.deleteTasks.mockResolvedValue([
            { id: '3', isCompleted: false },
        ]);
        mocks.tasks.clearCompletedTasks.mockResolvedValue();
        mocks.jiraInstance.configureAlarm.mockResolvedValue();
        mocks.jiraInstance.performJiraSync.mockResolvedValue({
            tasks: [{ id: 'jira-1' }],
            importedCount: 1,
            totalIssues: 2,
        });
        mocks.notifications.checkPermissions.mockResolvedValue('granted');
        mocks.notifications.show.mockResolvedValue();
    });

    it('handles ACTIONS.* requests with expected responses and state updates', async () => {
        const controller = await createController();
        const sendResponse = vi.fn();

        const run = async (action, payload = {}) => {
            await controller.handleMessage(
                { action, ...payload },
                {},
                sendResponse
            );
            return sendResponse.mock.calls.at(-1)[0];
        };

        expect((await run(ACTIONS.GET_STATE)).state).toBeTruthy();
        expect((await run(ACTIONS.START)).success).toBe(true);
        expect((await run(ACTIONS.PAUSE)).success).toBe(true);
        expect((await run(ACTIONS.RESET)).success).toBe(true);
        expect((await run(ACTIONS.RESET_TIMER)).success).toBe(true);

        controller.state.isWorkSession = false;
        expect((await run(ACTIONS.SKIP_BREAK)).state.isWorkSession).toBe(true);

        expect((await run(ACTIONS.TOGGLE_TIMER)).success).toBe(true);

        const settingsRes = await run(ACTIONS.SAVE_SETTINGS, {
            settings: { workDuration: 30, autoSyncJira: true },
        });
        expect(settingsRes.success).toBe(true);
        expect(settingsRes.state.timeLeft).toBe(30 * 60);

        expect(
            (await run(ACTIONS.CREATE_TASK, { task: { title: 'new' } })).success
        ).toBe(true);

        controller.state.currentTaskId = '1';
        await run(ACTIONS.UPDATE_TASK, {
            taskId: '1',
            updates: { isCompleted: true },
        });
        expect(controller.state.currentTaskId).toBeNull();

        controller.state.currentTaskId = '1';
        await run(ACTIONS.DELETE_TASK, { taskId: '1' });
        expect(controller.state.currentTaskId).toBeNull();

        controller.state.currentTaskId = '2';
        await run(ACTIONS.COMPLETE_TASKS, { taskIds: ['2'] });
        expect(controller.state.currentTaskId).toBeNull();

        controller.state.currentTaskId = '3';
        await run(ACTIONS.DELETE_TASKS, { taskIds: ['3'] });
        expect(controller.state.currentTaskId).toBeNull();

        expect((await run(ACTIONS.GET_TASKS)).success).toBe(true);
        expect((await run(ACTIONS.RECONFIGURE_JIRA_SYNC)).success).toBe(true);
        expect((await run(ACTIONS.IMPORT_JIRA_TASKS)).importedCount).toBe(1);

        expect(
            (await run(ACTIONS.SET_CURRENT_TASK, { taskId: 'x' })).state
                .currentTaskId
        ).toBe('x');

        const uiRes = await run(ACTIONS.UPDATE_UI_PREFERENCES, {
            uiPreferences: { hideCompleted: true },
        });
        expect(uiRes.state.uiPreferences.hideCompleted).toBe(true);

        controller.state.currentTaskId = 'missing';
        await run(ACTIONS.CLEAR_COMPLETED_TASKS);
        expect(controller.state.currentTaskId).toBeNull();

        expect((await run(ACTIONS.CLEAR_STATISTICS)).success).toBe(true);
        expect((await run(ACTIONS.GET_STATISTICS_HISTORY)).history).toEqual([
            { date: '2025-01-01' },
        ]);
        expect((await run(ACTIONS.CHECK_NOTIFICATIONS)).permissionLevel).toBe(
            'granted'
        );
        expect((await run('unknown-action')).error).toBe('Unknown action');
    });
});
