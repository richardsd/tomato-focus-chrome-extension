export const DEFAULT_SETTINGS = {
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
    jiraUsername: '',
    jiraToken: '',
    autoSyncJira: false,
    jiraSyncInterval: 30,
};

export function createDefaultState() {
    return {
        isRunning: false,
        timeLeft: DEFAULT_SETTINGS.workDuration * 60,
        endTime: null,
        currentSession: 1,
        isWorkSession: true,
        settings: { ...DEFAULT_SETTINGS },
        wasPausedForIdle: false,
        statistics: null,
        currentTaskId: null,
        tasks: [],
        uiPreferences: { hideCompleted: false },
    };
}
