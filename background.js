/**
 * Constants for the Pomodoro timer
 */
const CONSTANTS = {
    ALARM_NAME: 'pomodoroTimer',
    STORAGE_KEY: 'pomodoroState',
    NOTIFICATION_ID: 'pomodoroNotification',
    BADGE_UPDATE_INTERVAL: 1000,
    DEFAULT_SETTINGS: {
        workDuration: 25,
        shortBreak: 5,
        longBreak: 15,
        longBreakInterval: 4,
        autoStart: false,
        lightTheme: false
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
    }

    getState() {
        return {
            isRunning: this.isRunning,
            timeLeft: this.timeLeft,
            currentSession: this.currentSession,
            isWorkSession: this.isWorkSession,
            settings: { ...this.settings }
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
 * Manages notifications
 */
class NotificationManager {
    static async show(title, message) {
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
                silent: false,
                requireInteraction: false
            };

            await chromePromise.notifications.create(CONSTANTS.NOTIFICATION_ID, options);
            console.log('Notification created successfully');
        } catch (error) {
            console.error('Failed to create notification:', error);
            // Fallback notification without icon
            try {
                await chromePromise.notifications.create(CONSTANTS.NOTIFICATION_ID, {
                    type: 'basic',
                    title,
                    message,
                    silent: false
                });
            } catch (fallbackError) {
                console.error('Fallback notification also failed:', fallbackError);
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
        let badgeText = '';

        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            badgeText = `${hours}h${remainingMinutes > 0 ? remainingMinutes : ''}`;
        } else {
            badgeText = `${minutes}m`;
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
        this.setupAlarmListener();
        this.setupMessageListener();
        this.isInitialized = true;
        this.updateUI();
    }

    async loadState() {
        try {
            const savedState = await StorageManager.loadState();
            if (savedState) {
                Object.assign(this.state, savedState);
                // Don't restore running state on service worker restart
                this.state.isRunning = false;
            }
        } catch (error) {
            console.error('Failed to load state:', error);
        }
    }

    async saveState() {
        if (!this.isInitialized) return;
        
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
        if (this.state.isRunning) return;

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
        if (!this.state.isRunning) return;

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
        if (this.state.isWorkSession) return;

        this.pause();
        this.state.startWork();
        this.updateUI();
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
            this.state.incrementSession();
            
            if (this.state.shouldTakeLongBreak()) {
                this.state.startLongBreak();
                await NotificationManager.show('Tomato Focus', 'Time for a long break!');
            } else {
                this.state.startShortBreak();
                await NotificationManager.show('Tomato Focus', 'Time for a short break!');
            }
        } else {
            this.state.startWork();
            await NotificationManager.show('Tomato Focus', 'Time to work!');
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

    async handleMessage(request, sendResponse) {
        try {
            const { action } = request;
            
            switch (action) {
                case 'getState':
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

                case 'checkNotifications':
                    const permissionLevel = await NotificationManager.checkPermissions();
                    sendResponse({ permissionLevel });
                    break;

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
chrome.contextMenus.onClicked.addListener((info, tab) => {
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
