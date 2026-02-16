export function getSessionDurationSeconds({
    isWorkSession,
    currentSession,
    settings,
}) {
    if (isWorkSession) {
        return settings.workDuration * 60;
    }

    const shouldUseLongBreak =
        currentSession % settings.longBreakInterval === 0;
    return shouldUseLongBreak
        ? settings.longBreak * 60
        : settings.shortBreak * 60;
}

export function isLongBreakSession({ currentSession, settings }) {
    return currentSession % settings.longBreakInterval === 0;
}

export function computeNextSessionOnComplete(state) {
    const sessionType = state.isWorkSession ? 'Work' : 'Break';

    if (state.isWorkSession) {
        const takeLongBreak = isLongBreakSession(state);
        return {
            sessionType,
            isWorkSession: false,
            timeLeft: takeLongBreak
                ? state.settings.longBreak * 60
                : state.settings.shortBreak * 60,
            currentSession: state.currentSession,
            isRunning: state.settings.autoStart,
        };
    }

    return {
        sessionType,
        isWorkSession: true,
        timeLeft: state.settings.workDuration * 60,
        currentSession: state.currentSession + 1,
        isRunning: state.settings.autoStart,
    };
}

export function computeSkipBreakState(state) {
    if (state.isWorkSession) {
        return null;
    }

    return {
        currentSession: state.currentSession + 1,
        isWorkSession: true,
        timeLeft: state.settings.workDuration * 60,
        isRunning: state.settings.autoStart || state.isRunning,
    };
}
