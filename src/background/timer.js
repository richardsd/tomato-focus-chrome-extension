import { CONSTANTS, chromePromise } from './constants.js';
import { StatisticsManager } from './statistics.js';
import { TaskManager } from './tasks.js';
import { NotificationManager } from './notifications.js';
import { BadgeManager } from './badge.js';
import { ContextMenuManager } from './contextMenus.js';
import { fetchAssignedIssues } from './jira.js';
import { hasJiraPermission } from '../shared/jiraPermissions.js';
import { ACTIONS } from '../shared/runtimeActions.js';
import {
    DEFAULT_SETTINGS,
    createDefaultState,
} from '../shared/stateDefaults.js';

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

class StorageManager {
    static async saveState(state) {
        try {
            await chromePromise.storage.local.set({
                [CONSTANTS.STORAGE_KEY]: state,
            });
        } catch (error) {
            console.error('Failed to save state:', error);
        }
    }

    static async loadState() {
        try {
            const result = await chromePromise.storage.local.get([
                CONSTANTS.STORAGE_KEY,
            ]);
            return result[CONSTANTS.STORAGE_KEY] || null;
        } catch (error) {
            console.error('Failed to load state:', error);
            return null;
        }
    }
}

export class TimerController {
    constructor() {
        this.state = new TimerState();
        this.alarmName = CONSTANTS.ALARM_NAME;
        this.jiraAlarmName = CONSTANTS.JIRA_SYNC_ALARM;
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
        const defaultState = createDefaultState();
        if (savedState) {
            Object.assign(this.state, defaultState, savedState);
            this.state.settings = {
                ...DEFAULT_SETTINGS,
                ...(savedState.settings || {}),
            };
            this.state.tasks = Array.isArray(savedState.tasks)
                ? savedState.tasks
                : defaultState.tasks;
            this.state.uiPreferences = {
                ...defaultState.uiPreferences,
                ...(savedState.uiPreferences || {}),
            };
            if (savedState.endTime) {
                const remainingMs = savedState.endTime - Date.now();
                this.state.timeLeft = Math.max(
                    0,
                    Math.ceil(remainingMs / 1000)
                );
            }
        } else {
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
        const settings = this.state.settings || {};
        await new Promise((resolve) =>
            chrome.alarms.clear(this.jiraAlarmName, resolve)
        );

        const {
            autoSyncJira,
            jiraSyncInterval,
            jiraUrl,
            jiraUsername,
            jiraToken,
        } = settings;
        if (!autoSyncJira) {
            return;
        }

        if (!jiraUrl || !jiraUsername || !jiraToken) {
            console.warn(
                'Jira auto-sync is enabled but configuration is incomplete. Skipping alarm registration.'
            );
            return;
        }

        const hasPermission = await hasJiraPermission(jiraUrl);
        if (!hasPermission) {
            console.warn(
                'Jira auto-sync is enabled but host permission is not granted. Skipping alarm registration.'
            );
            return;
        }

        const interval =
            Number.parseInt(jiraSyncInterval, 10) ||
            DEFAULT_SETTINGS.jiraSyncInterval;
        const sanitizedInterval = Math.min(Math.max(interval, 5), 720);
        chrome.alarms.create(this.jiraAlarmName, {
            periodInMinutes: sanitizedInterval,
        });
    }

    async performJiraSync() {
        const { jiraUrl, jiraUsername, jiraToken } = this.state.settings;
        const hasPermission = await hasJiraPermission(jiraUrl);
        if (!hasPermission) {
            throw new Error(
                'Jira permission not granted. Please enable Jira access in settings.'
            );
        }
        const issues = await fetchAssignedIssues({
            jiraUrl,
            jiraUsername,
            jiraToken,
        });
        const existingTasks = await TaskManager.getTasks();
        const existingTitles = new Set(
            existingTasks.map((task) => (task.title || '').trim().toLowerCase())
        );
        let createdCount = 0;

        for (const issue of issues) {
            const normalizedTitle = (issue.title || '').trim();
            const fallbackTitle = normalizedTitle || issue.key || 'Jira Task';
            const dedupeKey = fallbackTitle.toLowerCase();

            if (existingTitles.has(dedupeKey)) {
                continue;
            }

            await TaskManager.createTask({
                title: fallbackTitle,
                description: issue.description,
                estimatedPomodoros: 1,
            });
            existingTitles.add(dedupeKey);
            createdCount++;
        }

        this.state.tasks = await TaskManager.getTasks();
        await this.saveState();
        this.sendMessageToPopup(ACTIONS.UPDATE_TIMER, this.state.getState());

        return { importedCount: createdCount, totalIssues: issues.length };
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
            await NotificationManager.show(
                'Tomato Focus',
                message,
                this.state.settings
            );
        } catch (error) {
            console.error('Automatic Jira sync failed:', error);
            await NotificationManager.show(
                'Tomato Focus',
                `Jira sync failed: ${error.message}`,
                this.state.settings
            );
        }
    }

    updateUI() {
        const { timeLeft, isRunning, isWorkSession } = this.state;

        BadgeManager.update(timeLeft, isRunning, isWorkSession);
        ContextMenuManager.update(isRunning, isWorkSession, timeLeft);

        // Send message to popup if it's open
        this.sendMessageToPopup(ACTIONS.UPDATE_TIMER, this.state.getState());

        this.saveState();
    }

    sendMessageToPopup(action, data) {
        chrome.runtime.sendMessage({ action, state: data }).catch((error) => {
            // Ignore connection errors when no popup is open
            if (!error.message.includes('Receiving end does not exist')) {
                console.warn('Failed to send message to popup:', error.message);
            }
        });
    }

    setupAlarmListener() {
        chrome.alarms.onAlarm.addListener((alarm) => {
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
        chrome.idle.onStateChanged.addListener(async (newState) => {
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
            chrome.idle.queryState(60, async (state) => {
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
        this.updateBadge();
        ContextMenuManager.update(
            true,
            this.state.isWorkSession,
            this.state.timeLeft
        );
        this.updateUI();
    }

    async pause() {
        if (!this.state.isRunning) {
            return;
        }

        this.state.isRunning = false;
        this.state.endTime = null;
        await chrome.alarms.clear(this.alarmName);
        await this.saveState();
        this.stopBadgeUpdater();
        this.updateBadge();
        ContextMenuManager.update(
            false,
            this.state.isWorkSession,
            this.state.timeLeft
        );
        this.updateUI();
    }

    async reset() {
        this.state.isRunning = false;
        this.state.currentSession = 1;
        this.state.startWork();
        this.state.endTime = null;
        await chrome.alarms.clear(this.alarmName);
        await this.saveState();
        this.stopBadgeUpdater();
        this.updateBadge();
        ContextMenuManager.update(
            false,
            this.state.isWorkSession,
            this.state.timeLeft
        );
        this.updateUI();
    }

    async scheduleAlarm() {
        const now = Date.now();
        const when = now + this.state.timeLeft * 1000;
        this.state.endTime = when;
        await chrome.alarms.create(this.alarmName, { when });
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

            const takeLongBreak = this.state.shouldTakeLongBreak();
            if (takeLongBreak) {
                this.state.startLongBreak();
            } else {
                this.state.startShortBreak();
            }
        } else {
            this.state.incrementSession();
            this.state.startWork();
        }

        this.state.isRunning = this.state.settings.autoStart;
        await this.saveState();

        if (this.state.settings.playSound || NotificationManager) {
            await NotificationManager.show(
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

        this.updateBadge();
        ContextMenuManager.update(
            this.state.isRunning,
            this.state.isWorkSession,
            this.state.timeLeft
        );
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
        if (!this.state.isWorkSession) {
            this.state.incrementSession();
            this.state.startWork();
            this.state.isRunning =
                this.state.settings.autoStart || this.state.isRunning;
            await chrome.alarms.clear(this.alarmName);
            if (this.state.isRunning) {
                await this.scheduleAlarm();
                this.startBadgeUpdater();
            } else {
                this.state.endTime = null;
                this.stopBadgeUpdater();
            }
            await this.saveState();
            this.updateBadge();
            ContextMenuManager.update(
                this.state.isRunning,
                this.state.isWorkSession,
                this.state.timeLeft
            );
            this.updateUI();
        }
    }

    async startQuickTimer(minutes) {
        this.state.isRunning = true;
        this.state.isWorkSession = true;
        this.state.timeLeft = minutes * 60;
        await this.saveState();
        await this.scheduleAlarm();
        this.stopBadgeUpdater();
        this.startBadgeUpdater();
        this.updateBadge();
        ContextMenuManager.update(true, true, this.state.timeLeft);
        this.updateUI();
    }

    updateBadge() {
        BadgeManager.update(
            this.state.timeLeft,
            this.state.isRunning,
            this.state.isWorkSession
        );
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
                    this.updateBadge();
                    this.sendMessageToPopup(
                        ACTIONS.UPDATE_TIMER,
                        this.state.getState()
                    );
                    this.stopBadgeUpdater();
                } else {
                    this.updateBadge();
                    this.sendMessageToPopup(
                        ACTIONS.UPDATE_TIMER,
                        this.state.getState()
                    );
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
                        : this.state.currentSession %
                                this.state.settings.longBreakInterval ===
                            0
                          ? this.state.settings.longBreak * 60
                          : this.state.settings.shortBreak * 60;

                    // Reset remaining time to the newly selected duration rather than
                    // adjusting by the previously elapsed amount which was causing the
                    // timer to grow instead of updating to the expected value.
                    this.state.timeLeft = newDuration;

                    if (this.state.isRunning) {
                        await chrome.alarms.clear(this.alarmName);
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

    chrome.contextMenus.onClicked.addListener((info) => {
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
        ContextMenuManager.create();
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
        chrome.alarms.clearAll();
    });
}
