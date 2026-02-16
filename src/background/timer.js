import { CONSTANTS } from './constants.js';
import { StatisticsManager } from './statistics.js';
import { TaskManager } from './tasks.js';
import { NotificationManager } from './notifications.js';
import { ContextMenuManager } from './contextMenus.js';
import { ACTIONS } from '../shared/runtimeActions.js';
import { createDefaultState } from '../shared/stateDefaults.js';
import { JiraSyncManager } from './jiraSync.js';
import { StorageManager } from './storageManager.js';
import { UiNotifier } from './uiNotifier.js';
import {
    computeNextSessionOnComplete,
    computeSkipBreakState,
    getSessionDurationSeconds,
} from '../core/timerStateMachine.js';
import {
    createChromeContextMenusAdapter,
    createChromeIdleProvider,
    createChromeSchedulerAdapter,
} from './adapters/chromeAdapters.js';

class TimerState {
    constructor() {
        this.reset();
    }

    reset() {
        Object.assign(this, createDefaultState());
    }

    getState() {
        return {
            isRunning: this.isRunning,
            timeLeft: this.timeLeft,
            endTime: this.endTime,
            currentSession: this.currentSession,
            isWorkSession: this.isWorkSession,
            settings: { ...this.settings },
            wasPausedForIdle: this.wasPausedForIdle,
            statistics: this.statistics,
            currentTaskId: this.currentTaskId,
            tasks: this.tasks,
            uiPreferences: { ...this.uiPreferences },
        };
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    startWork() {
        this.timeLeft = this.settings.workDuration * 60;
        this.isWorkSession = true;
    }

    startShortBreak() {
        this.timeLeft = this.settings.shortBreak * 60;
        this.isWorkSession = false;
    }

    startLongBreak() {
        this.timeLeft = this.settings.longBreak * 60;
        this.isWorkSession = false;
    }

    incrementSession() {
        this.currentSession++;
    }

    shouldTakeLongBreak() {
        // Check if the current session count indicates it's time for a long break
        return this.currentSession % this.settings.longBreakInterval === 0;
    }
}

export class TimerController {
    constructor({
        scheduler = createChromeSchedulerAdapter(),
        idleProvider = createChromeIdleProvider(),
    } = {}) {
        this.state = new TimerState();
        this.alarmName = CONSTANTS.ALARM_NAME;
        this.jiraAlarmName = CONSTANTS.JIRA_SYNC_ALARM;
        this.scheduler = scheduler;
        this.idleProvider = idleProvider;
        this.jiraSync = new JiraSyncManager({
            alarmName: this.jiraAlarmName,
            scheduler: this.scheduler,
        });
        this.uiNotifier = new UiNotifier({
            saveState: () => this.saveState(),
        });
        this.isInitialized = false;

        this.init();
    }

    async init() {
        await this.loadState();
        await this.loadStatistics();
        await this.loadTasks();
        this.setupAlarmListener();
        this.setupMessageListener();
        this.setupIdleListener();
        await this.configureJiraSyncAlarm();
        this.isInitialized = true;
        this.checkIdleResume();
        this.updateUI();
    }

    async loadState() {
        const savedState = await StorageManager.loadState();
        const hasSavedState = StorageManager.applySavedState(
            this.state,
            savedState
        );
        if (!hasSavedState) {
            await this.saveState();
        }
    }

    async saveState() {
        await StorageManager.saveState(this.state.getState());
    }

    async loadStatistics() {
        this.state.statistics = await StatisticsManager.getStatistics();
    }

    async loadTasks() {
        this.state.tasks = await TaskManager.getTasks();
    }

    async configureJiraSyncAlarm() {
        await this.jiraSync.configureAlarm(this.state.settings);
    }

    async performJiraSync() {
        const result = await this.jiraSync.performJiraSync(this.state.settings);
        this.state.tasks = result.tasks;
        await this.saveState();
        this.uiNotifier.sendTimerUpdate(this.state);
        return {
            importedCount: result.importedCount,
            totalIssues: result.totalIssues,
        };
    }

    async handleJiraSyncAlarm() {
        try {
            const { importedCount, totalIssues } = await this.performJiraSync();
            let message;
            if (importedCount > 0) {
                message = `Imported ${importedCount} Jira ${importedCount === 1 ? 'task' : 'tasks'}.`;
            } else if (totalIssues > 0) {
                message = 'Jira sync complete – tasks are already up to date.';
            } else {
                message = 'Jira sync complete – no assigned issues found.';
            }
            await this.uiNotifier.notify(
                'Tomato Focus',
                message,
                this.state.settings
            );
        } catch (error) {
            console.error('Automatic Jira sync failed:', error);
            await this.uiNotifier.notify(
                'Tomato Focus',
                `Jira sync failed: ${error.message}`,
                this.state.settings
            );
        }
    }

    updateUI() {
        this.uiNotifier.updateUI(this.state);
    }

    setupAlarmListener() {
        this.scheduler.onAlarm((alarm) => {
            if (alarm.name === this.alarmName) {
                this.onTimerComplete();
            } else if (alarm.name === this.jiraAlarmName) {
                this.handleJiraSyncAlarm().catch((error) => {
                    console.error('Failed to handle Jira sync alarm:', error);
                });
            }
        });
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener(
            (request, sender, sendResponse) => {
                this.handleMessage(request, sender, sendResponse);
                return true; // Keep the message channel open for async responses
            }
        );
    }

    setupIdleListener() {
        this.idleProvider.onStateChanged(async (newState) => {
            if (
                newState === 'idle' &&
                this.state.isRunning &&
                this.state.settings.pauseOnIdle
            ) {
                console.log('Auto-pausing due to idle state');
                this.pause();
                this.state.wasPausedForIdle = true;
                await this.saveState();
            }
        });
    }

    checkIdleResume() {
        if (this.state.wasPausedForIdle && this.state.settings.pauseOnIdle) {
            this.idleProvider.queryState(60, async (state) => {
                if (state === 'active') {
                    console.log('Resuming after idle');
                    this.state.wasPausedForIdle = false;
                    await this.saveState();
                    this.updateUI();
                }
            });
        }
    }

    async start() {
        if (this.state.isRunning) {
            return;
        }

        this.state.isRunning = true;
        await this.saveState();
        await this.scheduleAlarm();
        this.startBadgeUpdater();
        this.uiNotifier.updateBadge(this.state);
        this.uiNotifier.updateContextMenu(this.state);
        this.updateUI();
    }

    async pause() {
        if (!this.state.isRunning) {
            return;
        }

        this.state.isRunning = false;
        this.state.endTime = null;
        await this.scheduler.clear(this.alarmName);
        await this.saveState();
        this.stopBadgeUpdater();
        this.uiNotifier.updateBadge(this.state);
        this.uiNotifier.updateContextMenu(this.state);
        this.updateUI();
    }

    async reset() {
        this.state.isRunning = false;
        this.state.currentSession = 1;
        this.state.startWork();
        this.state.endTime = null;
        await this.scheduler.clear(this.alarmName);
        await this.saveState();
        this.stopBadgeUpdater();
        this.uiNotifier.updateBadge(this.state);
        this.uiNotifier.updateContextMenu(this.state);
        this.updateUI();
    }

    async scheduleAlarm() {
        const now = Date.now();
        const when = now + this.state.timeLeft * 1000;
        this.state.endTime = when;
        await this.scheduler.create(this.alarmName, { when });
    }

    async onTimerComplete() {
        const sessionType = this.state.isWorkSession ? 'Work' : 'Break';
        console.log(`${sessionType} session complete`);

        if (this.state.isWorkSession) {
            await StatisticsManager.incrementCompleted();
            await StatisticsManager.addFocusTime(
                this.state.settings.workDuration
            );
            this.state.statistics = await StatisticsManager.getStatistics();
            if (this.state.currentTaskId) {
                await TaskManager.incrementTaskPomodoros(
                    this.state.currentTaskId
                );
                this.state.tasks = await TaskManager.getTasks();
            }
        }
        const nextSession = computeNextSessionOnComplete(this.state);
        this.state.currentSession = nextSession.currentSession;
        this.state.isWorkSession = nextSession.isWorkSession;
        this.state.timeLeft = nextSession.timeLeft;
        this.state.isRunning = nextSession.isRunning;
        await this.saveState();

        if (this.state.settings.playSound || NotificationManager) {
            await this.uiNotifier.notify(
                'Tomato Focus',
                `${sessionType} session complete`,
                this.state.settings
            );
        }

        if (this.state.isRunning) {
            await this.scheduleAlarm();
            this.startBadgeUpdater();
        } else {
            this.state.endTime = null;
            this.stopBadgeUpdater();
        }

        this.uiNotifier.updateBadge(this.state);
        this.uiNotifier.updateContextMenu(this.state);
        this.updateUI();
    }

    async toggle() {
        if (this.state.isRunning) {
            await this.pause();
        } else {
            await this.start();
        }
    }

    async skipBreak() {
        const nextState = computeSkipBreakState(this.state);
        if (!nextState) {
            return;
        }

        this.state.currentSession = nextState.currentSession;
        this.state.isWorkSession = nextState.isWorkSession;
        this.state.timeLeft = nextState.timeLeft;
        this.state.isRunning = nextState.isRunning;
        await this.scheduler.clear(this.alarmName);
        if (this.state.isRunning) {
            await this.scheduleAlarm();
            this.startBadgeUpdater();
        } else {
            this.state.endTime = null;
            this.stopBadgeUpdater();
        }
        await this.saveState();
        this.uiNotifier.updateBadge(this.state);
        this.uiNotifier.updateContextMenu(this.state);
        this.updateUI();
    }

    async startQuickTimer(minutes) {
        this.state.isRunning = true;
        this.state.isWorkSession = true;
        this.state.timeLeft = minutes * 60;
        await this.saveState();
        await this.scheduleAlarm();
        this.stopBadgeUpdater();
        this.startBadgeUpdater();
        this.uiNotifier.updateBadge(this.state);
        this.uiNotifier.updateContextMenu(this.state);
        this.updateUI();
    }

    startBadgeUpdater() {
        if (this.badgeInterval) {
            return;
        }
        this.badgeInterval = setInterval(() => {
            if (this.state.isRunning) {
                this.state.timeLeft--;
                if (this.state.timeLeft <= 0) {
                    this.state.timeLeft = 0;
                    this.uiNotifier.updateBadge(this.state);
                    this.uiNotifier.sendTimerUpdate(this.state);
                    this.stopBadgeUpdater();
                } else {
                    this.uiNotifier.updateBadge(this.state);
                    this.uiNotifier.sendTimerUpdate(this.state);
                }
            }
        }, CONSTANTS.BADGE_UPDATE_INTERVAL);
    }

    stopBadgeUpdater() {
        if (this.badgeInterval) {
            clearInterval(this.badgeInterval);
            this.badgeInterval = null;
        }
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case ACTIONS.GET_STATE:
                    sendResponse({ state: this.state.getState() });
                    break;
                case ACTIONS.START:
                    await this.start();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.PAUSE:
                    await this.pause();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.RESET:
                case ACTIONS.RESET_TIMER:
                    await this.reset();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.SKIP_BREAK:
                    await this.skipBreak();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.TOGGLE_TIMER:
                    await this.toggle();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.SAVE_SETTINGS: {
                    this.state.updateSettings(request.settings);

                    const newDuration = this.state.isWorkSession
                        ? this.state.settings.workDuration * 60
                        : getSessionDurationSeconds(this.state);

                    // Reset remaining time to the newly selected duration rather than
                    // adjusting by the previously elapsed amount which was causing the
                    // timer to grow instead of updating to the expected value.
                    this.state.timeLeft = newDuration;

                    if (this.state.isRunning) {
                        await this.scheduler.clear(this.alarmName);
                        await this.scheduleAlarm();
                    } else {
                        this.state.endTime = null;
                    }

                    await this.configureJiraSyncAlarm();
                    this.updateUI();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                }
                case ACTIONS.CREATE_TASK:
                    await TaskManager.createTask(request.task);
                    this.state.tasks = await TaskManager.getTasks();
                    await this.saveState();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.UPDATE_TASK:
                    await TaskManager.updateTask(
                        request.taskId,
                        request.updates
                    );
                    this.state.tasks = await TaskManager.getTasks();
                    if (
                        this.state.currentTaskId === request.taskId &&
                        request.updates?.isCompleted
                    ) {
                        this.state.currentTaskId = null;
                    }
                    await this.saveState();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.DELETE_TASK:
                    await TaskManager.deleteTask(request.taskId);
                    if (this.state.currentTaskId === request.taskId) {
                        this.state.currentTaskId = null;
                    }
                    this.state.tasks = await TaskManager.getTasks();
                    await this.saveState();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.COMPLETE_TASKS: {
                    const taskIds = Array.isArray(request.taskIds)
                        ? request.taskIds
                        : [];
                    const completedIds = new Set(
                        taskIds.map((id) => String(id))
                    );
                    const updatedTasks =
                        await TaskManager.completeTasks(taskIds);
                    if (
                        this.state.currentTaskId &&
                        completedIds.has(String(this.state.currentTaskId))
                    ) {
                        this.state.currentTaskId = null;
                    }
                    this.state.tasks = updatedTasks;
                    await this.saveState();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                }
                case ACTIONS.DELETE_TASKS: {
                    const taskIds = Array.isArray(request.taskIds)
                        ? request.taskIds
                        : [];
                    const deletedIds = new Set(taskIds.map((id) => String(id)));
                    const updatedTasks = await TaskManager.deleteTasks(taskIds);
                    if (
                        this.state.currentTaskId &&
                        deletedIds.has(String(this.state.currentTaskId))
                    ) {
                        this.state.currentTaskId = null;
                    }
                    this.state.tasks = updatedTasks;
                    await this.saveState();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                }
                case ACTIONS.GET_TASKS: {
                    const tasks = await TaskManager.getTasks();
                    sendResponse({ success: true, tasks });
                    break;
                }
                case ACTIONS.RECONFIGURE_JIRA_SYNC: {
                    await this.configureJiraSyncAlarm();
                    sendResponse({ success: true });
                    break;
                }
                case ACTIONS.IMPORT_JIRA_TASKS: {
                    try {
                        const result = await this.performJiraSync();
                        sendResponse({
                            success: true,
                            state: this.state.getState(),
                            importedCount: result.importedCount,
                            totalIssues: result.totalIssues,
                        });
                    } catch (err) {
                        console.error('Failed to import Jira tasks:', err);
                        sendResponse({ error: err.message });
                    }
                    break;
                }
                case ACTIONS.SET_CURRENT_TASK:
                    this.state.currentTaskId = request.taskId;
                    await this.saveState();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.UPDATE_UI_PREFERENCES:
                    this.state.uiPreferences = {
                        ...this.state.uiPreferences,
                        ...(request.uiPreferences || request.updates || {}),
                    };
                    await this.saveState();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.CLEAR_COMPLETED_TASKS:
                    await TaskManager.clearCompletedTasks();
                    this.state.tasks = await TaskManager.getTasks();
                    if (this.state.currentTaskId) {
                        const exists = this.state.tasks.some(
                            (t) => t.id === this.state.currentTaskId
                        );
                        if (!exists) {
                            this.state.currentTaskId = null;
                        }
                    }
                    await this.saveState();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.CLEAR_STATISTICS:
                    await StatisticsManager.clearAll();
                    await this.loadStatistics();
                    sendResponse({
                        success: true,
                        state: this.state.getState(),
                    });
                    break;
                case ACTIONS.GET_STATISTICS_HISTORY: {
                    const all = await StatisticsManager.getAllStatistics();
                    sendResponse({ success: true, history: all });
                    break;
                }
                case ACTIONS.CHECK_NOTIFICATIONS: {
                    const permissionLevel =
                        await NotificationManager.checkPermissions();
                    sendResponse({ success: true, permissionLevel });
                    break;
                }
                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        }
    }
}

export function initializeBackground() {
    const timerController = new TimerController();
    const contextMenus = createChromeContextMenusAdapter();

    contextMenus.onClicked((info) => {
        const { menuItemId } = info;
        switch (menuItemId) {
            case 'start-pause':
                timerController.toggle();
                break;
            case 'reset':
                timerController.reset();
                break;
            case 'skip-break':
                timerController.skipBreak();
                break;
            case 'quick-5':
                timerController.startQuickTimer(5);
                break;
            case 'quick-15':
                timerController.startQuickTimer(15);
                break;
            case 'quick-25':
                timerController.startQuickTimer(25);
                break;
            case 'quick-45':
                timerController.startQuickTimer(45);
                break;
            default:
                console.warn('Unknown context menu item:', menuItemId);
        }
    });

    chrome.runtime.onStartup.addListener(() => {
        console.log('Extension started');
    });

    chrome.runtime.onInstalled.addListener((details) => {
        console.log('Extension installed/updated:', details.reason);
        void ContextMenuManager.create();
        NotificationManager.checkPermissions().then((level) => {
            console.log('Notification permission level:', level);
            if (level !== 'granted') {
                console.warn('Notifications may not work properly');
            }
        });
    });

    chrome.runtime.onSuspend.addListener(() => {
        console.log('Service worker suspending - saving state');
        timerController.saveState();
    });

    self.addEventListener('beforeunload', () => {
        timerController.stopBadgeUpdater();
        timerController.scheduler.clearAll();
    });
}
