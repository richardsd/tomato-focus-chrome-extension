const USER_DATA_SCHEMA_ID = 'com.tomatofocus.user-data';
const USER_DATA_SCHEMA_VERSION = 1;

function normalizeSettings(settings = {}) {
    return {
        workDuration: Number(settings.workDuration || 25),
        shortBreak: Number(settings.shortBreak || 5),
        longBreak: Number(settings.longBreak || 15),
        longBreakInterval: Number(settings.longBreakInterval || 4),
        autoStart: Boolean(settings.autoStart),
        theme: String(settings.theme || 'system'),
        pauseOnIdle: settings.pauseOnIdle !== false,
        playSound: settings.playSound !== false,
        volume: Number.isFinite(Number(settings.volume))
            ? Number(settings.volume)
            : 0.7,
        jiraUrl: String(settings.jiraUrl || ''),
        jiraUsername: String(settings.jiraUsername || ''),
        jiraToken: String(settings.jiraToken || ''),
        autoSyncJira: Boolean(settings.autoSyncJira),
        jiraSyncInterval: Number(settings.jiraSyncInterval || 30),
    };
}

function normalizeTasks(tasks = []) {
    if (!Array.isArray(tasks)) {
        return [];
    }

    return tasks.map((task, index) => ({
        id: String(task?.id || `task-${index + 1}`),
        title: String(task?.title || 'Untitled Task'),
        description: String(task?.description || ''),
        estimatedPomodoros: Math.max(1, Number(task?.estimatedPomodoros || 1)),
        completedPomodoros: Math.max(0, Number(task?.completedPomodoros || 0)),
        isCompleted: Boolean(task?.isCompleted),
        createdAt: String(task?.createdAt || new Date().toISOString()),
        completedAt: task?.completedAt ? String(task.completedAt) : null,
    }));
}

function normalizeStatistics(statistics = {}) {
    if (
        !statistics ||
        typeof statistics !== 'object' ||
        Array.isArray(statistics)
    ) {
        return {};
    }

    const normalized = {};
    for (const [dateKey, value] of Object.entries(statistics)) {
        normalized[String(dateKey)] = {
            completedToday: Math.max(0, Number(value?.completedToday || 0)),
            focusTimeToday: Math.max(0, Number(value?.focusTimeToday || 0)),
        };
    }

    return normalized;
}

export function exportUserDataSchema(
    state = {},
    { exportedAt = new Date() } = {}
) {
    return {
        schemaId: USER_DATA_SCHEMA_ID,
        schemaVersion: USER_DATA_SCHEMA_VERSION,
        exportedAt: exportedAt.toISOString(),
        conflictPolicy: 'sourceFileReplacesLocal',
        data: {
            settings: normalizeSettings(state.settings),
            tasks: normalizeTasks(state.tasks),
            statistics: normalizeStatistics(state.statistics),
            currentTaskId: state.currentTaskId
                ? String(state.currentTaskId)
                : null,
            timer: {
                isRunning: Boolean(state.isRunning),
                timeLeft: Math.max(0, Number(state.timeLeft || 0)),
                endTime: state.endTime || null,
                currentSession: Math.max(1, Number(state.currentSession || 1)),
                isWorkSession: state.isWorkSession !== false,
            },
            uiPreferences: {
                hideCompleted: Boolean(state.uiPreferences?.hideCompleted),
            },
        },
    };
}

export { USER_DATA_SCHEMA_ID, USER_DATA_SCHEMA_VERSION };
