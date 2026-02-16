import { DEFAULT_SETTINGS } from '../shared/stateDefaults.js';

export const CONSTANTS = {
    ALARM_NAME: 'pomodoroTimer',
    JIRA_SYNC_ALARM: 'jiraSyncAlarm',
    STORAGE_KEY: 'pomodoroState',
    STATISTICS_KEY: 'pomodoroStatistics',
    TASKS_KEY: 'pomodoroTasks',
    NOTIFICATION_ID: 'pomodoroNotification',
    BADGE_UPDATE_INTERVAL: 1000,
    DEFAULT_SETTINGS,
};

// Utility function to promisify Chrome APIs
export const chromePromise = {
    storage: {
        local: {
            get: (keys) =>
                new Promise((resolve) =>
                    chrome.storage.local.get(keys, resolve)
                ),
            set: (items) =>
                new Promise((resolve) =>
                    chrome.storage.local.set(items, resolve)
                ),
        },
    },
    notifications: {
        getPermissionLevel: () =>
            new Promise((resolve) =>
                chrome.notifications.getPermissionLevel(resolve)
            ),
        create: (id, options) =>
            new Promise((resolve, reject) => {
                chrome.notifications.create(id, options, (notificationId) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(notificationId);
                    }
                });
            }),
    },
};
