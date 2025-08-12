/**
 * Constants for the Pomodoro timer
 */
const CONSTANTS = {
    ALARM_NAME: 'pomodoroTimer',
    STORAGE_KEY: 'pomodoroState',
    STATISTICS_KEY: 'pomodoroStatistics',
    NOTIFICATION_ID: 'pomodoroNotification',
    BADGE_UPDATE_INTERVAL: 1000,
    DEFAULT_SETTINGS: {
        workDuration: 25,
        shortBreak: 5,
        longBreak: 15,
        longBreakInterval: 4,
        autoStart: false,
        theme: 'system',
        pauseOnIdle: true,
        playSound: true,
        volume: 0.7
    }
};

/**
 * Utility function to promisify Chrome APIs
 */
const chromePromise = {
    storage: {
        local: {
            get: (keys) => new Promise(resolve => chrome.storage.local.get(keys, resolve)),
            set: (items) => new Promise(resolve => chrome.storage.local.set(items, resolve))
        }
    },
    notifications: {
        getPermissionLevel: () => new Promise(resolve => chrome.notifications.getPermissionLevel(resolve)),
        create: (id, options) => new Promise((resolve, reject) => {
            chrome.notifications.create(id, options, (notificationId) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(notificationId);
                }
            });
        })
    }
};

/**
 * Manages timer state and settings
 */
class TimerState {
    constructor() {
        this.reset();
    }

    reset() {
        this.isRunning = false;
        this.timeLeft = CONSTANTS.DEFAULT_SETTINGS.workDuration * 60;
        this.currentSession = 1;
        this.isWorkSession = true;
        this.settings = { ...CONSTANTS.DEFAULT_SETTINGS };
        this.wasPausedForIdle = false;
        this.statistics = null; // Will be loaded async
    }

    getState() {
        return {
            isRunning: this.isRunning,
            timeLeft: this.timeLeft,
            currentSession: this.currentSession,
            isWorkSession: this.isWorkSession,
            settings: { ...this.settings },
            wasPausedForIdle: this.wasPausedForIdle,
            statistics: this.statistics
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

/**
 * Manages data persistence
 */
class StorageManager {
    static async saveState(state) {
        try {
            await chromePromise.storage.local.set({
                [CONSTANTS.STORAGE_KEY]: state
            });
        } catch (error) {
            console.error('Failed to save state:', error);
        }
    }

    static async loadState() {
        try {
            const result = await chromePromise.storage.local.get([CONSTANTS.STORAGE_KEY]);
            return result[CONSTANTS.STORAGE_KEY] || null;
        } catch (error) {
            console.error('Failed to load state:', error);
            return null;
        }
    }
}

/**
 * Manages daily statistics tracking
 */
class StatisticsManager {
    static getTodayKey() {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    static async getStatistics() {
        try {
            const result = await chromePromise.storage.local.get([CONSTANTS.STATISTICS_KEY]);
            const allStats = result[CONSTANTS.STATISTICS_KEY] || {};
            const todayKey = this.getTodayKey();

            // Return today's statistics, initializing if needed
            return allStats[todayKey] || {
                completedToday: 0,
                focusTimeToday: 0
            };
        } catch (error) {
            console.error('Failed to load statistics:', error);
            return {
                completedToday: 0,
                focusTimeToday: 0
            };
        }
    }

    static async saveStatistics(todayStats) {
        try {
            const result = await chromePromise.storage.local.get([CONSTANTS.STATISTICS_KEY]);
            const allStats = result[CONSTANTS.STATISTICS_KEY] || {};
            const todayKey = this.getTodayKey();

            allStats[todayKey] = todayStats;

            // Clean up old statistics (keep only last 30 days)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);

            Object.keys(allStats).forEach(dateKey => {
                const statDate = new Date(dateKey);
                if (statDate < cutoffDate) {
                    delete allStats[dateKey];
                }
            });

            await chromePromise.storage.local.set({
                [CONSTANTS.STATISTICS_KEY]: allStats
            });
        } catch (error) {
            console.error('Failed to save statistics:', error);
        }
    }

    static async incrementCompleted() {
        const stats = await this.getStatistics();
        stats.completedToday++;
        await this.saveStatistics(stats);
        return stats;
    }

    static async addFocusTime(minutes) {
        const stats = await this.getStatistics();
        stats.focusTimeToday += minutes;
        await this.saveStatistics(stats);
        return stats;
    }
}

/**
 * Manages notifications
 */
class NotificationManager {
    static async show(title, message, settings = {}) {
        try {
            const permissionLevel = await chromePromise.notifications.getPermissionLevel();

            if (permissionLevel !== 'granted') {
                console.warn('Notifications not permitted. Permission level:', permissionLevel);
                return;
            }

            const options = {
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title,
                message,
                silent: true, // Always silent - we'll play our custom sound
                requireInteraction: false
            };

            await chromePromise.notifications.create(CONSTANTS.NOTIFICATION_ID, options);
            console.log('Notification created successfully');

            // Play custom sound if enabled
            if (settings.playSound) {
                try {
                    await NotificationManager.playSound(settings.volume);
                } catch (audioError) {
                    console.error('Failed to play sound:', audioError);
                }
            }
        } catch (error) {
            console.error('Failed to create notification:', error);
            // Fallback notification without icon
            try {
                await chromePromise.notifications.create(CONSTANTS.NOTIFICATION_ID, {
                    type: 'basic',
                    title,
                    message,
                    silent: true
                });

                // Still try to play sound on fallback
                if (settings.playSound) {
                    try {
                        await NotificationManager.playSound(settings.volume);
                    } catch (audioError) {
                        console.error('Failed to play sound on fallback:', audioError);
                    }
                }
            } catch (fallbackError) {
                console.error('Fallback notification also failed:', fallbackError);
            }
        }
    }

    static async playSound(volume = 0.7) {
        try {
            // Check if offscreen document already exists
            const existingContexts = await chrome.runtime.getContexts({
                contextTypes: ['OFFSCREEN_DOCUMENT']
            });

            if (existingContexts.length === 0) {
                // Create an offscreen document to play the sound
                // Since service workers don't have access to Audio API
                await chrome.offscreen.createDocument({
                    url: 'offscreen.html',
                    reasons: ['AUDIO_PLAYBACK'],
                    justification: 'Play notification sound'
                });
            }

            // Send message to offscreen document to play sound
            const response = await chrome.runtime.sendMessage({
                action: 'playSound',
                soundUrl: chrome.runtime.getURL('sounds/notification.mp3'),
                volume: typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : 0.7
            });

            if (response && !response.success) {
                throw new Error(response.error || 'Unknown error playing sound');
            }
        } catch (error) {
            console.error('Failed to play sound via offscreen document:', error);
            // Fallback: try using system notification sound
            try {
                await chromePromise.notifications.create('fallback-sound', {
                    type: 'basic',
                    title: 'Tomato Focus',
                    message: '',
                    silent: false
                });
                // Clear the fallback notification immediately
                setTimeout(() => chrome.notifications.clear('fallback-sound'), 100);
            } catch (fallbackError) {
                console.error('Fallback sound notification also failed:', fallbackError);
            }
        }
    }

    static async checkPermissions() {
        try {
            return await chromePromise.notifications.getPermissionLevel();
        } catch (error) {
            console.error('Failed to check notification permissions:', error);
            return 'denied';
        }
    }
}

/**
 * Manages the extension badge
 */
class BadgeManager {
    static update(timeLeft, isRunning, isWorkSession) {
        if (timeLeft <= 0 || !isRunning) {
            chrome.action.setBadgeText({ text: '' });
            return;
        }

        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        let badgeText = '';

        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            badgeText = `${hours}h${remainingMinutes > 0 ? remainingMinutes : ''}`;
        } else if (minutes >= 1) {
            badgeText = `${minutes}m`;
        } else {
            // Show seconds when less than 1 minute remains
            badgeText = `${seconds}s`;
        }

        chrome.action.setBadgeText({ text: badgeText });

        const badgeColor = isWorkSession ? '#ff4444' : '#44ff44';
        chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    }
}

/**
 * Manages context menus
 */
class ContextMenuManager {
    static create() {
        chrome.contextMenus.removeAll(() => {
            const menuItems = [
                {
                    id: 'start-pause',
                    title: 'Start Timer',
                    contexts: ['action']
                },
                {
                    id: 'reset',
                    title: 'Reset Timer',
                    contexts: ['action']
                },
                {
                    id: 'skip-break',
                    title: 'Skip Break',
                    contexts: ['action'],
                    enabled: false
                },
                {
                    id: 'separator1',
                    type: 'separator',
                    contexts: ['action']
                },
                {
                    id: 'quick-times',
                    title: 'Quick Start',
                    contexts: ['action']
                },
                {
                    id: 'quick-5',
                    parentId: 'quick-times',
                    title: '5 minutes',
                    contexts: ['action']
                },
                {
                    id: 'quick-15',
                    parentId: 'quick-times',
                    title: '15 minutes',
                    contexts: ['action']
                },
                {
                    id: 'quick-25',
                    parentId: 'quick-times',
                    title: '25 minutes (Pomodoro)',
                    contexts: ['action']
                },
                {
                    id: 'quick-45',
                    parentId: 'quick-times',
                    title: '45 minutes',
                    contexts: ['action']
                }
            ];

            menuItems.forEach(item => {
                chrome.contextMenus.create(item, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error creating context menu:', chrome.runtime.lastError);
                    }
                });
            });
        });
    }

    static update(isRunning, isWorkSession, timeLeft) {
        const startPauseTitle = isRunning ? 'Pause Timer' : 'Start Timer';

        chrome.contextMenus.update('start-pause', { title: startPauseTitle }, () => {
            if (chrome.runtime.lastError) {
                console.log('Context menu not ready yet:', chrome.runtime.lastError.message);
            }
        });

        chrome.contextMenus.update('skip-break', {
            enabled: !isWorkSession && timeLeft > 0
        }, () => {
            if (chrome.runtime.lastError) {
                console.log('Context menu not ready yet:', chrome.runtime.lastError.message);
            }
        });
    }
}

/**
 * Main timer controller class
 */
class TimerController {
    constructor() {
        this.state = new TimerState();
        this.alarmName = CONSTANTS.ALARM_NAME;
        this.isInitialized = false;

        this.init();
    }

    async init() {
        await this.loadState();
        await this.loadStatistics();
        this.setupAlarmListener();
        this.setupMessageListener();
        this.setupIdleListener();
        this.isInitialized = true;
        this.checkIdleResume();
        this.updateUI();
    }

    async loadState() {
        try {
            const savedState = await StorageManager.loadState();
            if (savedState) {
                Object.assign(this.state, savedState);
                // Ensure defaults for any missing settings
                this.state.settings = { ...CONSTANTS.DEFAULT_SETTINGS, ...this.state.settings };
                // Don't restore running state on service worker restart
                this.state.isRunning = false;
            }
        } catch (error) {
            console.error('Failed to load state:', error);
        }
    }

    async loadStatistics() {
        try {
            this.state.statistics = await StatisticsManager.getStatistics();
        } catch (error) {
            console.error('Failed to load statistics:', error);
            this.state.statistics = { completedToday: 0, focusTimeToday: 0 };
        }
    }

    async saveState() {
        if (!this.isInitialized) {return;}

        try {
            await StorageManager.saveState(this.state.getState());
        } catch (error) {
            console.error('Failed to save state:', error);
        }
    }

    updateUI() {
        const { timeLeft, isRunning, isWorkSession } = this.state;

        BadgeManager.update(timeLeft, isRunning, isWorkSession);
        ContextMenuManager.update(isRunning, isWorkSession, timeLeft);

        // Send message to popup if it's open
        this.sendMessageToPopup('updateTimer', this.state.getState());

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

    start() {
        if (this.state.isRunning) {return;}

        this.state.isRunning = true;

        // Clear any existing alarms
        chrome.alarms.clear(this.alarmName);

        // Create alarm for when timer should end
        const alarmTime = Date.now() + (this.state.timeLeft * 1000);
        chrome.alarms.create(this.alarmName, { when: alarmTime });

        // Update badge every second
        this.startBadgeUpdater();
        this.updateUI();
    }

    pause() {
        if (!this.state.isRunning) {return;}

        this.state.isRunning = false;
        chrome.alarms.clear(this.alarmName);
        this.stopBadgeUpdater();
        this.updateUI();
    }

    toggle() {
        if (this.state.isRunning) {
            this.pause();
        } else {
            this.start();
        }
    }

    reset() {
        this.pause();
        this.state.timeLeft = this.state.settings.workDuration * 60;
        this.state.isWorkSession = true;
        this.state.currentSession = 1;
        this.updateUI();
    }

    skipBreak() {
        if (this.state.isWorkSession) {return;}

        this.pause();

        // When break is skipped, increment session (since break cycle is considered complete)
        this.state.incrementSession();
        this.state.startWork();
        this.updateUI();

        if (this.state.settings.autoStart) {
            this.start();
        }
    }

    startQuickTimer(minutes) {
        this.pause();
        this.state.timeLeft = minutes * 60;
        this.state.isWorkSession = true;
        this.updateUI();
        this.start();
    }

    async handleSessionEnd() {
        this.state.isRunning = false;

        if (this.state.isWorkSession) {
            // When work session ends, track the completed session and focus time
            try {
                const focusTimeMinutes = this.state.settings.workDuration;
                this.state.statistics = await StatisticsManager.incrementCompleted();
                this.state.statistics = await StatisticsManager.addFocusTime(focusTimeMinutes);
            } catch (error) {
                console.error('Failed to update statistics:', error);
            }

            // Determine break type
            const isLongBreakTime = this.state.currentSession % this.state.settings.longBreakInterval === 0;

            if (isLongBreakTime) {
                this.state.startLongBreak();
                await NotificationManager.show('Tomato Focus', 'Time for a long break!', this.state.settings);
            } else {
                this.state.startShortBreak();
                await NotificationManager.show('Tomato Focus', 'Time for a short break!', this.state.settings);
            }
        } else {
            // When break ends, increment session and start work
            this.state.incrementSession();
            this.state.startWork();
            await NotificationManager.show('Tomato Focus', 'Time to work!', this.state.settings);
        }

        this.updateUI();

        if (this.state.settings.autoStart) {
            this.start();
        }
    }

    updateSettings(newSettings) {
        this.state.updateSettings(newSettings);
        this.reset();
    }

    startBadgeUpdater() {
        this.stopBadgeUpdater();
        this.badgeInterval = setInterval(() => {
            if (this.state.isRunning && this.state.timeLeft > 0) {
                this.state.timeLeft--;
                BadgeManager.update(this.state.timeLeft, this.state.isRunning, this.state.isWorkSession);
                this.sendMessageToPopup('updateTimer', this.state.getState());

                // Save state periodically (every 10 seconds)
                if (this.state.timeLeft % 10 === 0) {
                    this.saveState();
                }
            }
        }, 1000);
    }

    stopBadgeUpdater() {
        if (this.badgeInterval) {
            clearInterval(this.badgeInterval);
            this.badgeInterval = null;
        }
    }

    setupAlarmListener() {
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === this.alarmName) {
                this.handleSessionEnd();
            }
        });
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sendResponse);
            return true; // Keep alive for async response
        });
    }

    setupIdleListener() {
        // Set default detection interval (60 seconds)
        if (chrome.idle && chrome.idle.setDetectionInterval) {
            chrome.idle.setDetectionInterval(60);
        }

        chrome.idle.onStateChanged.addListener((newState) => {
            if (!this.state.settings.pauseOnIdle) {
                return;
            }

            if (newState === 'idle' || newState === 'locked') {
                if (this.state.isRunning) {
                    this.state.wasPausedForIdle = true;
                    this.pause();
                }
            } else if (newState === 'active') {
                if (this.state.wasPausedForIdle) {
                    this.state.wasPausedForIdle = false;
                    if (this.state.settings.autoStart) {
                        this.start();
                    } else {
                        NotificationManager.show('Tomato Focus', 'Timer paused while you were away', this.state.settings);
                        this.updateUI();
                    }
                }
            }
        });
    }

    checkIdleResume() {
        if (!chrome.idle || !chrome.idle.queryState) {
            return;
        }

        chrome.idle.queryState(60, (state) => {
            if (state !== 'active' || !this.state.wasPausedForIdle) {
                return;
            }

            this.state.wasPausedForIdle = false;
            if (this.state.settings.autoStart) {
                this.start();
            } else {
                NotificationManager.show('Tomato Focus', 'Timer paused while you were away', this.state.settings);
                this.updateUI();
            }
        });
    }

    async handleMessage(request, sendResponse) {
        try {
            const { action } = request;

            switch (action) {
            case 'getState':
                // Refresh statistics before sending state
                await this.loadStatistics();
                sendResponse(this.state.getState());
                break;

            case 'toggleTimer':
                this.toggle();
                sendResponse(this.state.getState());
                break;

            case 'resetTimer':
                this.reset();
                sendResponse(this.state.getState());
                break;

            case 'skipBreak':
                this.skipBreak();
                sendResponse(this.state.getState());
                break;

            case 'saveSettings':
                this.updateSettings(request.settings);
                sendResponse(this.state.getState());
                break;

            case 'checkNotifications': {
                const permissionLevel = await NotificationManager.checkPermissions();
                sendResponse({ permissionLevel });
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

// Initialize the timer controller
const timerController = new TimerController();

// Handle context menu clicks
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

// Extension lifecycle events
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension started');
});

chrome.runtime.onInstalled.addListener((details) => {
    console.log('Extension installed/updated:', details.reason);

    // Create context menus
    ContextMenuManager.create();

    // Check notification permissions on install
    NotificationManager.checkPermissions().then(level => {
        console.log('Notification permission level:', level);
        if (level !== 'granted') {
            console.warn('Notifications may not work properly');
        }
    });
});

// Handle service worker suspension/restoration
chrome.runtime.onSuspend.addListener(() => {
    console.log('Service worker suspending - saving state');
    timerController.saveState();
});

// Cleanup on shutdown
self.addEventListener('beforeunload', () => {
    timerController.stopBadgeUpdater();
    chrome.alarms.clearAll();
});
