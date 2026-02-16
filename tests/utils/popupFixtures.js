export function createPopupDomFixture() {
    document.body.innerHTML = `
        <div id="timerPanel"></div>
        <div id="settingsPanel" class="hidden"></div>
        <div id="tasksPanel" class="hidden"></div>
        <div id="statsPanel" class="hidden"></div>
        <div id="timer"></div>
        <button id="startBtn"><span class="btn-text"></span></button>
        <button id="pauseBtn" class="hidden"></button>
        <button id="resetBtn"></button>
        <button id="skipBreakBtn"></button>
        <div id="cycleProgress"></div>
        <div id="completedToday"></div>
        <div id="focusTime"></div>
        <button id="saveSettings"></button>
        <button id="resetSettingsBtn"></button>
        <button id="clearDataBtn"></button>
        <button id="syncJiraBtn"></button>
        <button id="settingsBtn"></button>
        <button id="tasksBtn"></button>
        <button id="statsBtn"></button>
        <button id="backBtn"></button>
        <button id="backFromTasksBtn"></button>
        <button id="backFromStatsBtn"></button>
        <div id="statsSummary"></div>
        <div id="statsHistorySection"></div>
        <div id="stats7DayChart"></div>
        <button id="clearTaskBtn"></button>
        <button id="addTaskBtn"></button>
        <div id="tasksList"></div>
        <div id="taskFormModal"></div>
        <form id="taskForm"></form>
        <button id="closeTaskFormBtn"></button>
        <button id="cancelTaskBtn"></button>
        <div id="sessionIcon"><img /></div>
        <div id="sessionTitle"></div>
        <div id="currentTask" class="hidden"></div>
        <div id="currentTaskName"></div>
        <div id="currentTaskProgress"></div>
        <div id="notificationStatus" style="display:none"><div id="notificationMessage"></div></div>
        <svg>
            <circle class="timer__progress-ring-background"></circle>
            <circle class="timer__progress-ring-progress"></circle>
        </svg>
        <input id="workDuration" type="number" />
        <input id="shortBreak" type="number" />
        <input id="longBreak" type="number" />
        <input id="longBreakInterval" type="number" />
        <input id="autoStart" type="checkbox" />
        <select id="theme"><option value="system">system</option><option value="dark">dark</option><option value="light">light</option></select>
        <input id="pauseOnIdle" type="checkbox" />
        <input id="playSound" type="checkbox" />
        <input id="volume" type="number" />
        <input id="jiraUrl" />
        <input id="jiraUsername" />
        <input id="jiraToken" />
        <input id="autoSyncJira" type="checkbox" />
        <input id="jiraSyncInterval" type="number" />
        <div id="tasksCount" class="hidden"></div>
    `;
}

export function createBaseState(overrides = {}) {
    const base = {
        isRunning: false,
        timeLeft: 1500,
        currentSession: 1,
        isWorkSession: true,
        currentTaskId: null,
        tasks: [],
        statistics: {
            completedToday: 2,
            focusTimeToday: 45,
        },
        uiPreferences: {
            tasksFilter: 'all',
        },
        settings: {
            workDuration: 25,
            shortBreak: 5,
            longBreak: 15,
            longBreakInterval: 4,
            autoStart: false,
            theme: 'system',
            pauseOnIdle: true,
            playSound: true,
            volume: 0.5,
            jiraUrl: '',
            jiraUsername: '',
            jiraToken: '',
            autoSyncJira: false,
            jiraSyncInterval: 30,
        },
    };

    return {
        ...base,
        ...overrides,
        settings: {
            ...base.settings,
            ...(overrides.settings || {}),
        },
        statistics: {
            ...base.statistics,
            ...(overrides.statistics || {}),
        },
        uiPreferences: {
            ...base.uiPreferences,
            ...(overrides.uiPreferences || {}),
        },
    };
}
