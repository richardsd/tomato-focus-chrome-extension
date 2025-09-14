export const CONSTANTS = {
    ALARM_NAME: 'pomodoroTimer',
    STORAGE_KEY: 'pomodoroState',
    STATISTICS_KEY: 'pomodoroStatistics',
    TASKS_KEY: 'pomodoroTasks',
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

// Utility function to promisify Chrome APIs
export const chromePromise = {
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
