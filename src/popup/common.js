import { DEFAULT_STATE, RETRY_DELAY } from '../shared/uiConstants.js';
import {
    debounce,
    escapeHtml,
    formatTime,
    getElement,
    getElementById,
} from '../shared/uiUtils.js';

export const POPUP_CONSTANTS = {
    RETRY_DELAY,
    ANIMATION_DURATION: 300,
    UPDATE_DEBOUNCE: 50,
    PROGRESS_RING_RADIUS: 80, // reduced 10% (was 90) to match smaller SVG
    SELECTORS: {
        timer: '#timer',
        startBtn: '#startBtn',
        pauseBtn: '#pauseBtn',
        resetBtn: '#resetBtn',
        skipBreakBtn: '#skipBreakBtn',
        cycleProgress: '#cycleProgress',
        completedToday: '#completedToday',
        focusTime: '#focusTime',
        saveSettingsBtn: '#saveSettings',
        resetSettingsBtn: '#resetSettingsBtn',
        clearDataBtn: '#clearDataBtn',
        jiraUrl: '#jiraUrl',
        jiraUsername: '#jiraUsername',
        jiraToken: '#jiraToken',
        autoSyncJira: '#autoSyncJira',
        jiraSyncInterval: '#jiraSyncInterval',
        syncJiraBtn: '#syncJiraBtn',
        notificationStatus: '#notificationStatus',
        notificationMessage: '#notificationMessage',
        timerPanel: '#timerPanel',
        settingsPanel: '#settingsPanel',
        tasksPanel: '#tasksPanel',
        statsPanel: '#statsPanel',
        settingsBtn: '#settingsBtn',
        tasksBtn: '#tasksBtn',
        statsBtn: '#statsBtn',
        backBtn: '#backBtn',
        backFromTasksBtn: '#backFromTasksBtn',
        backFromStatsBtn: '#backFromStatsBtn',
        statsSummary: '#statsSummary',
        statsHistorySection: '#statsHistorySection',
        stats7DayChart: '#stats7DayChart',
        progressRing: '.timer__progress-ring-progress',
        progressRingBackground: '.timer__progress-ring-background',
        sessionIcon: '#sessionIcon',
        sessionTitle: '#sessionTitle',
        currentTask: '#currentTask',
        currentTaskName: '#currentTaskName',
        currentTaskProgress: '#currentTaskProgress',
        clearTaskBtn: '#clearTaskBtn',
        addTaskBtn: '#addTaskBtn',
        tasksList: '#tasksList',
        taskFormModal: '#taskFormModal',
        taskForm: '#taskForm',
        closeTaskFormBtn: '#closeTaskFormBtn',
        cancelTaskBtn: '#cancelTaskBtn',
    },
    THEMES: {
        WORK: {
            iconSrc: 'icons/icon.svg',
            iconAlt: 'Tomato',
            title: 'Tomato Focus',
            className: '',
        },
        BREAK: {
            iconSrc: 'icons/green-icon.svg',
            iconAlt: 'Green Tomato Break',
            title: 'Break Time',
            className: 'break-mode',
        },
    },
    DEFAULT_STATE,
};

export const utils = {
    debounce,
    escapeHtml,
    formatTime,
    formatFocusTime(minutes) {
        if (minutes < 60) {
            return `${minutes}m`;
        } else {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return remainingMinutes > 0
                ? `${hours}h ${remainingMinutes}m`
                : `${hours}h`;
        }
    },
    getCircumference(radius = POPUP_CONSTANTS.PROGRESS_RING_RADIUS) {
        return 2 * Math.PI * radius;
    },
    getElement,
    getElementById,
    validateState(state) {
        return (
            state &&
            typeof state.isRunning === 'boolean' &&
            typeof state.timeLeft === 'number' &&
            typeof state.currentSession === 'number' &&
            typeof state.isWorkSession === 'boolean' &&
            state.settings &&
            typeof state.settings === 'object'
        );
        // Note: statistics, tasks, and currentTaskId are optional and may be null during initialization
    },
};
