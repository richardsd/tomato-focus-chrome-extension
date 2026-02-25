import { CONSTANTS } from './constants.js';
import { StatisticsManager } from './statistics.js';
import { TaskManager } from './tasks.js';
import { NotificationManager } from './notifications.js';
import { ContextMenuManager } from './contextMenus.js';
import { createDefaultState } from '../shared/stateDefaults.js';
import { JiraSyncManager } from './jiraSync.js';
import { StorageManager } from './storageManager.js';
import { UiNotifier } from './uiNotifier.js';
import { createLogger } from '../shared/logger.js';
import { createActionHandlers } from './actionHandlers/index.js';

const logger = createLogger('TimerController');

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
    constructor() {
        this.state = new TimerState();
        this.alarmName = CONSTANTS.ALARM_NAME;
        this.jiraAlarmName = CONSTANTS.JIRA_SYNC_ALARM;
        this.jiraSync = new JiraSyncManager({
            alarmName: this.jiraAlarmName,
        });
        this.uiNotifier = new UiNotifier({
            saveState: () => this.saveState(),
        });
        this.messageHandlers = createActionHandlers(this);
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
                logger.debug('Auto-pausing due to idle state');
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
                    logger.debug('Resuming after idle');
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
        await chrome.alarms.clear(this.alarmName);
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
        await chrome.alarms.clear(this.alarmName);
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
        await chrome.alarms.create(this.alarmName, { when });
    }

    async onTimerComplete() {
        const sessionType = this.state.isWorkSession ? 'Work' : 'Break';
        logger.debug(`${sessionType} session complete`);

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
            this.uiNotifier.updateBadge(this.state);
            this.uiNotifier.updateContextMenu(this.state);
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
            const action = request?.action;
            const handler = this.messageHandlers[action];

            if (!handler) {
                sendResponse({ error: 'Unknown action' });
                return;
            }

            const response = await handler(request, sender);
            sendResponse(response);
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
        logger.debug('Extension started');
    });

    chrome.runtime.onInstalled.addListener((details) => {
        logger.debug('Extension installed/updated:', details.reason);
        ContextMenuManager.create();
        NotificationManager.checkPermissions().then((level) => {
            logger.debug('Notification permission level:', level);
            if (level !== 'granted') {
                console.warn('Notifications may not work properly');
            }
        });
    });

    chrome.runtime.onSuspend.addListener(() => {
        logger.debug('Service worker suspending - saving state');
        timerController.saveState();
    });

    self.addEventListener('beforeunload', () => {
        timerController.stopBadgeUpdater();
        chrome.alarms.clearAll();
    });
}
