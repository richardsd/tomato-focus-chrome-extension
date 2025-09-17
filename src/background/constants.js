export const CONSTANTS = {
    ALARM_NAME: 'pomodoroTimer',
    JIRA_SYNC_ALARM: 'jiraSyncAlarm',
    STORAGE_KEY: 'pomodoroState',
    STATISTICS_KEY: 'pomodoroStatistics',
    TASKS_KEY: 'pomodoroTasks',
    JIRA_AUTH_STORAGE_KEY: 'jiraOAuthState',
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
        volume: 0.7,
        jiraUrl: '',
        jiraCloudId: '',
        jiraSiteName: '',
        jiraAccount: null,
        jiraOAuth: null,
        autoSyncJira: false,
        jiraSyncInterval: 30
    },
    ATLASSIAN_AUTH: {
        CLIENT_ID: 'YOUR_CLIENT_ID_HERE',
        AUTHORIZATION_URL: 'https://auth.atlassian.com/authorize',
        TOKEN_URL: 'https://auth.atlassian.com/oauth/token',
        API_BASE_URL: 'https://api.atlassian.com',
        SCOPES: [
            'offline_access',
            'read:jira-user',
            'read:jira-work'
        ],
        TOKEN_REFRESH_SKEW_MS: 60000
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
