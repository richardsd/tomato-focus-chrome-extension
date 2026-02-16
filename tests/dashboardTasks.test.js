import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardTaskManager } from '../src/dashboard/tasks.js';
import { ACTIONS } from '../src/shared/runtimeActions.js';

const TASKS = [
    {
        id: 'task-1',
        title: 'Write tests',
        description: 'dashboard module',
        completedPomodoros: 1,
        estimatedPomodoros: 3,
        isCompleted: false,
        createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
        id: 'task-2',
        title: 'Ship feature',
        description: 'release prep',
        completedPomodoros: 2,
        estimatedPomodoros: 2,
        isCompleted: true,
        createdAt: '2024-01-02T00:00:00.000Z',
    },
];

function createTasksFixture() {
    document.body.innerHTML = `
        <section id="tasksRoot">
            <button id="dashboardNewTaskButton" type="button">New</button>
            <section id="dashboardTaskComposer" hidden>
                <h2 id="dashboardTaskComposerTitle"></h2>
                <button id="dashboardCloseComposer" type="button">Close</button>
                <form id="dashboardTaskForm">
                    <div id="dashboardTaskFormErrors"></div>
                    <div id="dashboardTaskTitleError"></div>
                    <input id="dashboardTaskTitle" />
                    <textarea id="dashboardTaskDescription"></textarea>
                    <input id="dashboardTaskEstimate" value="1" />
                    <button id="dashboardTaskCancel" type="button">Cancel</button>
                    <button id="dashboardTaskSubmit" type="submit">Submit</button>
                </form>
            </section>

            <button data-task-filter="all" type="button">all</button>
            <button data-task-filter="pending" type="button">pending</button>
            <button data-task-filter="completed" type="button">completed</button>
            <input id="dashboardTaskSearch" />
            <button id="dashboardTaskSearchClear" type="button">clear search</button>
            <button id="dashboardRefreshTasks" type="button">refresh</button>

            <article id="dashboardCurrentTaskCard">
                <p id="dashboardFocusStatus"></p>
                <p id="dashboardFocusMeta"></p>
                <p id="dashboardFocusTimer"></p>
                <p id="dashboardFocusPhase"></p>
                <p id="dashboardFocusDescription"></p>
                <p id="dashboardFocusQuote"></p>
                <button id="dashboardFocusQuoteToggle" type="button"></button>
                <button id="dashboardFocusToggle" type="button"></button>
                <button id="dashboardFocusReset" type="button"></button>
                <button id="dashboardFocusDetails" type="button"></button>
                <button id="dashboardClearCurrentTask" type="button"></button>
            </article>

            <div id="dashboardTasksList"></div>
        </section>
    `;

    return document.getElementById('tasksRoot');
}

describe('DashboardTaskManager', () => {
    beforeEach(() => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        vi.spyOn(window, 'alert').mockImplementation(() => {});
    });

    it('renders focus/task state and filters by search query', () => {
        const manager = new DashboardTaskManager({
            container: createTasksFixture(),
        });
        manager.init();

        manager.render({
            tasks: TASKS,
            currentTaskId: 'task-1',
            timeLeft: 120,
            isRunning: true,
            isWorkSession: true,
        });

        expect(
            document.getElementById('dashboardFocusStatus').textContent
        ).toBe('In progress');
        expect(document.querySelectorAll('.task-card')).toHaveLength(2);

        manager.searchQuery = 'ship';
        manager.renderTasksList();
        expect(document.querySelectorAll('.task-card')).toHaveLength(1);
        expect(document.querySelector('.task-card__title')?.textContent).toBe(
            'Ship feature'
        );
    });

    it('handles list actions and sends expected runtime actions', async () => {
        const sendMessage = vi.fn(async (action) => {
            if (action === ACTIONS.TOGGLE_TIMER) {
                return { toggled: true };
            }
            return { tasks: TASKS };
        });
        const refreshState = vi.fn().mockResolvedValue(undefined);
        const onStateUpdate = vi.fn();
        const toastManager = { show: vi.fn() };

        const manager = new DashboardTaskManager({
            container: createTasksFixture(),
            messenger: { sendMessage },
            refreshState,
            onStateUpdate,
            toastManager,
        });

        manager.init();
        manager.render({
            tasks: TASKS,
            currentTaskId: null,
            timeLeft: 1500,
            isRunning: false,
            isWorkSession: true,
        });

        document.querySelector('[data-action="start"]').click();
        await Promise.resolve();
        await Promise.resolve();

        document.querySelector('[data-action="toggle-complete"]').click();
        await Promise.resolve();

        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.SET_CURRENT_TASK, {
            taskId: 'task-1',
        });
        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.TOGGLE_TIMER);
        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.COMPLETE_TASKS, {
            taskIds: ['task-1'],
        });
        expect(refreshState).toHaveBeenCalled();
        expect(onStateUpdate).toHaveBeenCalled();
        expect(toastManager.show).toHaveBeenCalledWith('Timer started.', {
            variant: 'success',
        });
    });
});
