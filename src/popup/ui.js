import { POPUP_CONSTANTS, utils } from './common.js';
import { TaskUIManager } from './tasks.js';
import { SettingsManager } from './settings.js';
import { notifyError, notifySuccess } from './notifications.js';
import {
    RuntimeMessenger,
    addRuntimeActionListener,
} from '../shared/runtimeMessaging.js';
import { ACTIONS } from '../shared/runtimeActions.js';
import { requestJiraPermission } from '../shared/jiraPermissions.js';

function isElementNode(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        'nodeType' in value &&
        value.nodeType === 1
    );
}

/**
 * Resolve a selector or element reference, scoped to a root element when provided.
 *
 * @param {Element|Document} root - The element to scope the lookup to.
 * @param {string|Element|null|undefined} target - Selector string or existing element reference.
 * @returns {Element|null}
 */
function resolveElement(root, target) {
    if (!target) {
        return null;
    }

    if (isElementNode(target)) {
        return target;
    }

    if (typeof target === 'string') {
        if (root && root !== document) {
            const scoped = root.querySelector(target);
            if (scoped) {
                return scoped;
            }
        }
        return document.querySelector(target);
    }

    return null;
}

/**
 * Initialize shared panel header behaviour.
 *
 * @param {NavigationManager} navigationManager - Instance controlling panel navigation.
 * @param {Array<Object>} panelConfigs - Panel configuration objects.
 * @returns {Map<string, {panel: Element, header: Element, backButton: Element|null, actions: Element|null, refreshActions: Function}>}
 */
export function initPanelHeaders(navigationManager, panelConfigs = []) {
    const controllers = new Map();

    if (!navigationManager || !Array.isArray(panelConfigs)) {
        return controllers;
    }

    const defaultBackHandler = () => {
        navigationManager.showTimerPanel();
    };

    panelConfigs.forEach((config = {}, index) => {
        const panelElement = resolveElement(document, config.panel);

        if (!panelElement) {
            console.warn(
                'Panel header initialisation skipped; panel not found.',
                config
            );
            return;
        }

        const headerElement = resolveElement(
            panelElement,
            config.headerSelector || '.panel-header'
        );

        if (!headerElement) {
            console.warn('Panel header element not found for panel.', config);
            return;
        }

        const backButtonElement = resolveElement(
            headerElement,
            config.backButtonSelector ||
                '.panel-header__back button, .btn--back'
        );

        if (backButtonElement) {
            const backHandler =
                typeof config.onBack === 'function'
                    ? config.onBack
                    : defaultBackHandler;

            backButtonElement.addEventListener('click', (event) => {
                backHandler(event, {
                    navigationManager,
                    panel: panelElement,
                    header: headerElement,
                });
            });
        }

        const actionsElement = resolveElement(
            headerElement,
            config.actionsSelector || '.panel-header__actions'
        );

        const refreshActions = () => {
            if (!actionsElement) {
                return;
            }

            const hasVisibleChildren = Array.from(actionsElement.children).some(
                (child) => {
                    if (!isElementNode(child)) {
                        return false;
                    }

                    const elementChild = /** @type {Element} */ (child);

                    if (
                        elementChild.hasAttribute('hidden') ||
                        elementChild.classList.contains('hidden')
                    ) {
                        return false;
                    }

                    const styles = window.getComputedStyle(elementChild);
                    return (
                        styles.display !== 'none' &&
                        styles.visibility !== 'hidden'
                    );
                }
            );

            actionsElement.classList.toggle(
                'panel-header__actions--empty',
                !hasVisibleChildren
            );

            if (hasVisibleChildren) {
                actionsElement.removeAttribute('aria-hidden');
            } else {
                actionsElement.setAttribute('aria-hidden', 'true');
            }
        };

        refreshActions();

        controllers.set(config.key || config.panel || `panel-${index}`, {
            panel: panelElement,
            header: headerElement,
            backButton: backButtonElement,
            actions: actionsElement,
            refreshActions,
        });
    });

    return controllers;
}

class MessageHandler extends RuntimeMessenger {
    constructor() {
        super({
            retryDelay: POPUP_CONSTANTS.RETRY_DELAY,
            fallbacks: { [ACTIONS.GET_STATE]: POPUP_CONSTANTS.DEFAULT_STATE },
        });
        this.unsubscribe = null;
        this.setupMessageListener();
    }

    /**
     * Setup listener for background script messages
     */
    setupMessageListener() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        this.unsubscribe = addRuntimeActionListener(
            ACTIONS.UPDATE_TIMER,
            (request) => {
                if (request.state) {
                    document.dispatchEvent(
                        new CustomEvent('timerUpdate', {
                            detail: request.state,
                        })
                    );
                }
            }
        );
    }
}

/**
 * Manages UI theme and visual states
 */
class ThemeManager {
    constructor() {
        this.body = document.body;
    }

    /**
     * Apply theme based on session type and settings
     */
    applyTheme(state) {
        // Handle work/break mode
        const theme = state.isWorkSession
            ? POPUP_CONSTANTS.THEMES.WORK
            : POPUP_CONSTANTS.THEMES.BREAK;

        // Update body class
        this.body.className = '';
        if (theme.className) {
            this.body.classList.add(theme.className);
        }

        // Apply user-selected or system theme
        let selectedTheme = state.settings.theme;
        if (!selectedTheme || selectedTheme === 'system') {
            selectedTheme = window.matchMedia('(prefers-color-scheme: dark)')
                .matches
                ? 'dark'
                : 'light';
        }
        this.body.classList.add(`${selectedTheme}-theme`);

        // Update session icon and title
        this.updateSessionDisplay(state, theme);
    }

    /**
     * Update session icon and title
     */
    updateSessionDisplay(state, theme) {
        const sessionIcon = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.sessionIcon
        );
        const sessionTitle = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.sessionTitle
        );

        if (sessionIcon) {
            const img = sessionIcon.querySelector('img');
            if (img) {
                img.src = theme.iconSrc;
                img.alt = theme.iconAlt;
            }
        }

        if (sessionTitle) {
            if (!state.isWorkSession) {
                // During break, determine if it's long or short based on current session count
                // This matches the logic in background.js where long breaks happen after sessions 4, 8, 12, etc.
                const isLongBreak =
                    state.currentSession % state.settings.longBreakInterval ===
                    0;
                sessionTitle.textContent = isLongBreak
                    ? 'Long Break'
                    : 'Short Break';
            } else {
                sessionTitle.textContent = theme.title;
            }
        }
    }
}

/**
 * Manages UI updates and animations
 */
class UIManager {
    constructor() {
        this.elements = this.cacheElements();
        this.circumference = utils.getCircumference();
        this.setProgressRingDasharray();
        this.debouncedUpdate = utils.debounce(
            this.updateProgressRing.bind(this),
            POPUP_CONSTANTS.UPDATE_DEBOUNCE
        );
        this._lastProgressOffset = null; // cache last applied strokeDashoffset to prevent redundant paints
        this._rafPending = false; // track scheduled rAF update
    }

    /**
     * Set strokeDasharray for progress ring elements based on radius
     */
    setProgressRingDasharray() {
        const { progressRing, progressRingBackground } = this.elements;
        if (progressRing) {
            progressRing.style.strokeDasharray = this.circumference;
        }
        if (progressRingBackground) {
            progressRingBackground.style.strokeDasharray = this.circumference;
        }
    }

    /**
     * Cache frequently accessed DOM elements
     */
    cacheElements() {
        const elements = {};
        Object.entries(POPUP_CONSTANTS.SELECTORS).forEach(([key, selector]) => {
            elements[key] = utils.getElement(selector);
        });
        return elements;
    }

    /**
     * Update the main UI with new state
     */
    updateUI(state) {
        if (!utils.validateState(state)) {
            console.error('Invalid state received:', state);
            return;
        }

        this.updateTimer(state);
        this.updateCycleProgress(state);
        this.updateStatistics(state);
        this.updateButtons(state);
        this.updateSettings(state);
        this.updateCurrentTaskDisplay(state);
        this.debouncedUpdate(state);
    }

    /**
     * Update timer display
     */
    updateTimer(state) {
        if (this.elements.timer) {
            this.elements.timer.textContent = utils.formatTime(state.timeLeft);
        }
    }

    /**
     * Update session count display
     */
    updateCycleProgress(state) {
        if (this.elements.cycleProgress) {
            const longBreakInterval = state.settings.longBreakInterval;
            // Calculate current position in the cycle (1-based)
            const currentInCycle =
                ((state.currentSession - 1) % longBreakInterval) + 1;
            this.elements.cycleProgress.textContent = `Focus ${currentInCycle} of ${longBreakInterval}`;
        }
    }

    /**
     * Update statistics display
     */
    updateStatistics(state) {
        if (state.statistics) {
            if (this.elements.completedToday) {
                this.elements.completedToday.textContent =
                    state.statistics.completedToday || 0;
            }
            if (this.elements.focusTime) {
                const focusTimeMinutes = state.statistics.focusTimeToday || 0;
                this.elements.focusTime.textContent =
                    utils.formatFocusTime(focusTimeMinutes);
            }
        }
    }

    /**
     * Update button states and visibility
     */
    updateButtons(state) {
        console.log('updateButtons called with state:', {
            isRunning: state.isRunning,
            autoStart: state.settings.autoStart,
        });

        // Update start/pause buttons
        if (state.isRunning) {
            console.log('Timer is running - hiding start, showing pause');
            this.hideElement(this.elements.startBtn);
            this.showElement(this.elements.pauseBtn);
        } else {
            console.log('Timer is not running - hiding pause, showing start');
            this.hideElement(this.elements.pauseBtn);
            this.showElement(this.elements.startBtn);

            // Update start button text (Start/Resume)
            if (this.elements.startBtn) {
                const fullDuration = this.calculateFullDuration(state);
                const isResuming =
                    state.timeLeft < fullDuration && state.timeLeft > 0;
                const buttonText = isResuming ? 'Resume' : 'Start';
                const buttonTextElement =
                    this.elements.startBtn.querySelector('.btn-text');
                if (buttonTextElement) {
                    buttonTextElement.textContent = buttonText;
                } else {
                    this.elements.startBtn.textContent = buttonText;
                }
                console.log('Updated start button text to:', buttonText);
            }
        }

        // Update skip break button state (always visible, but disabled during work sessions)
        const isBreakSession = !state.isWorkSession && state.timeLeft > 0;
        if (this.elements.skipBreakBtn) {
            this.elements.skipBreakBtn.disabled = !isBreakSession;
            console.log('Skip break button disabled:', !isBreakSession);
        }
    }

    /**
     * Update settings form values
     */
    updateSettings(state) {
        // Only update settings form if the settings panel is not currently visible
        // to avoid interfering with user input
        const settingsPanel = this.elements.settingsPanel;
        if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
            // Settings panel is visible, don't update to avoid interrupting user edits
            return;
        }

        this.forceUpdateSettings(state);
    }

    /**
     * Force update settings form values regardless of panel visibility
     * Used when explicitly navigating to settings panel
     */
    forceUpdateSettings(state) {
        const settingsInputs = {
            workDuration: state.settings.workDuration,
            shortBreak: state.settings.shortBreak,
            longBreak: state.settings.longBreak,
            longBreakInterval: state.settings.longBreakInterval,
            autoStart: state.settings.autoStart,
            theme: state.settings.theme || 'system',
            pauseOnIdle: state.settings.pauseOnIdle,
            playSound: state.settings.playSound,
            volume: state.settings.volume,
            jiraUrl: state.settings.jiraUrl || '',
            jiraUsername: state.settings.jiraUsername || '',
            jiraToken: state.settings.jiraToken || '',
            autoSyncJira: Boolean(state.settings.autoSyncJira),
            jiraSyncInterval:
                state.settings.jiraSyncInterval ??
                POPUP_CONSTANTS.DEFAULT_STATE.settings.jiraSyncInterval,
        };

        Object.entries(settingsInputs).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = value;
                } else {
                    element.value = value;
                }
            }
        });
    }

    /**
     * Update progress ring animation
     */
    updateProgressRing(state) {
        const progressRing = this.elements.progressRing;
        if (!progressRing) {
            return;
        }

        const totalDuration = this.calculateFullDuration(state);
        const progress = state.timeLeft / totalDuration;
        const offset = this.circumference * (1 - progress);
        // Batch DOM write in next animation frame to avoid mid-frame layout flashes
        if (
            this._lastProgressOffset !== null &&
            Math.abs(offset - this._lastProgressOffset) < 0.25
        ) {
            // Change is too small to matter visually; skip
            return;
        }
        if (this._rafPending) {
            return;
        }
        this._rafPending = true;
        (window.requestAnimationFrame || window.setTimeout)(() => {
            // Recompute just in case (elapsed time could change). We'll trust cached offset for simplicity.
            progressRing.style.strokeDashoffset = offset;
            this._lastProgressOffset = offset;
            this._rafPending = false;
        });
    }

    /**
     * Calculate full duration for current session type
     */
    calculateFullDuration(state) {
        if (state.isWorkSession) {
            return state.settings.workDuration * 60;
        }

        // During break, determine duration based on current session count
        // This matches the logic in background.js where long breaks happen after sessions 4, 8, 12, etc.
        const isLongBreak =
            state.currentSession % state.settings.longBreakInterval === 0;
        return isLongBreak
            ? state.settings.longBreak * 60
            : state.settings.shortBreak * 60;
    }

    /**
     * Update current task display
     */
    updateCurrentTaskDisplay(state) {
        const currentTaskElement = this.elements.currentTask;
        const currentTaskName = this.elements.currentTaskName;
        const currentTaskProgress = this.elements.currentTaskProgress;

        if (!currentTaskElement || !currentTaskName || !currentTaskProgress) {
            return;
        }

        if (!state.currentTaskId || !state.tasks) {
            currentTaskElement.classList.add('hidden');
            return;
        }

        const currentTask = state.tasks.find(
            (t) => t.id === state.currentTaskId
        );
        if (!currentTask) {
            currentTaskElement.classList.add('hidden');
            return;
        }

        currentTaskElement.classList.remove('hidden');
        currentTaskName.textContent = currentTask.title;
        currentTaskProgress.textContent = `${currentTask.completedPomodoros}/${currentTask.estimatedPomodoros} 🍅`;
    }

    /**
     * Show element with animation
     */
    showElement(element) {
        if (element) {
            element.classList.remove('hidden');
        }
    }

    /**
     * Hide element with animation
     */
    hideElement(element) {
        if (element) {
            element.classList.add('hidden');
        }
    }
}
/**
 * Manages notification status and messages
 */
class NotificationController {
    constructor(messageHandler) {
        this.messageHandler = messageHandler;
        this.statusElement = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.notificationStatus
        );
        this.messageElement = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.notificationMessage
        );
    }

    /**
     * Check and display notification permissions status
     */
    async checkPermissions() {
        try {
            const response =
                await this.messageHandler.sendMessage(ACTIONS.CHECK_NOTIFICATIONS);
            if (response && response.permissionLevel) {
                this.showNotificationStatus(response.permissionLevel);
            }
        } catch (error) {
            console.error('Failed to check notification permissions:', error);
        }
    }

    /**
     * Display notification permission status to user
     */
    showNotificationStatus(permissionLevel) {
        if (!this.statusElement || !this.messageElement) {
            return;
        }

        if (permissionLevel !== 'granted') {
            this.statusElement.style.display = 'block';
            this.statusElement.className =
                'mt-4 p-3 rounded-lg text-sm bg-yellow-100 border border-yellow-400';

            const isMac = navigator.platform.includes('Mac');
            this.messageElement.innerHTML = isMac
                ? this.getMacInstructions()
                : this.getGeneralInstructions();
        } else {
            this.statusElement.style.display = 'none';
        }
    }

    /**
     * Get macOS-specific notification instructions
     */
    getMacInstructions() {
        return `
            <strong>⚠️ Notifications Disabled</strong><br>
            To enable Pomodoro notifications on macOS:<br>
            1. Open <strong>System Preferences</strong><br>
            2. Go to <strong>Notifications & Focus</strong><br>
            3. Find <strong>Google Chrome</strong> in the list<br>
            4. Enable <strong>Allow Notifications</strong><br>
            5. Reload this extension and test again
        `;
    }

    /**
     * Get general notification instructions
     */
    getGeneralInstructions() {
        return `
            <strong>⚠️ Notifications Disabled</strong><br>
            Please enable notifications for Chrome in your system settings.
        `;
    }
}

/**
 * Manages settings form and validation
 */
class NavigationManager {
    constructor() {
        this.panels = {
            timer: utils.getElement(POPUP_CONSTANTS.SELECTORS.timerPanel),
            settings: utils.getElement(POPUP_CONSTANTS.SELECTORS.settingsPanel),
            tasks: utils.getElement(POPUP_CONSTANTS.SELECTORS.tasksPanel),
            stats: utils.getElement(POPUP_CONSTANTS.SELECTORS.statsPanel),
        };
    }

    /**
     * Show timer panel
     */
    showTimerPanel() {
        if (this.panels.timer) {
            this.panels.timer.classList.remove('hidden');
        }
        if (this.panels.settings) {
            this.panels.settings.classList.add('hidden');
        }
        if (this.panels.tasks) {
            this.panels.tasks.classList.add('hidden');
        }
        if (this.panels.stats) {
            this.panels.stats.classList.add('hidden');
        }
    }

    /**
     * Show settings panel
     */
    showSettingsPanel() {
        if (this.panels.timer) {
            this.panels.timer.classList.add('hidden');
        }
        if (this.panels.settings) {
            this.panels.settings.classList.remove('hidden');
        }
        if (this.panels.tasks) {
            this.panels.tasks.classList.add('hidden');
        }
    }

    /**
     * Show tasks panel
     */
    showTasksPanel() {
        console.log('NavigationManager: Showing tasks panel');
        if (this.panels.timer) {
            this.panels.timer.classList.add('hidden');
        }
        if (this.panels.settings) {
            this.panels.settings.classList.add('hidden');
        }
        if (this.panels.tasks) {
            this.panels.tasks.classList.remove('hidden');
            console.log('Tasks panel is now visible');
        } else {
            console.warn('Tasks panel element not found!');
        }
    }
    /**
     * Show stats panel
     */
    showStatsPanel() {
        if (this.panels.timer) {
            this.panels.timer.classList.add('hidden');
        }
        if (this.panels.settings) {
            this.panels.settings.classList.add('hidden');
        }
        if (this.panels.tasks) {
            this.panels.tasks.classList.add('hidden');
        }
        if (this.panels.stats) {
            this.panels.stats.classList.remove('hidden');
        }
    }
}
/**
 * Main popup controller that orchestrates all components
 */
class PopupController {
    constructor() {
        this.messageHandler = new MessageHandler();
        this.uiManager = new UIManager();
        this.themeManager = new ThemeManager();
        this.notificationController = new NotificationController(
            this.messageHandler
        );
        this.settingsManager = new SettingsManager();
        this.navigationManager = new NavigationManager();
        this.panelHeaders = initPanelHeaders(this.navigationManager, [
            {
                key: 'settings',
                panel: POPUP_CONSTANTS.SELECTORS.settingsPanel,
                backButtonSelector: POPUP_CONSTANTS.SELECTORS.backBtn,
            },
            {
                key: 'tasks',
                panel: POPUP_CONSTANTS.SELECTORS.tasksPanel,
                backButtonSelector: POPUP_CONSTANTS.SELECTORS.backFromTasksBtn,
            },
            {
                key: 'stats',
                panel: POPUP_CONSTANTS.SELECTORS.statsPanel,
                backButtonSelector: POPUP_CONSTANTS.SELECTORS.backFromStatsBtn,
            },
        ]);
        this.taskUIManager = new TaskUIManager(this.messageHandler);
        // Bind layout sync for height management
        this.syncCurrentTaskLayout = this.syncCurrentTaskLayout.bind(this);

        console.log('PopupController initialized');
        this.init();
    }

    /**
     * Initialize the popup
     */
    async init() {
        try {
            console.log('Initializing popup...');

            // Ensure we start with the timer panel visible and modal hidden
            this.navigationManager.showTimerPanel();
            this.taskUIManager.hideTaskForm();

            await this.loadInitialState();
            this.setupEventListeners();
            this.checkNotifications();

            // Make sure the tasks list is rendered with empty state if no tasks
            const state = await this.messageHandler.sendMessage(
                ACTIONS.GET_STATE
            );
            if (this.taskUIManager) {
                this.taskUIManager.renderTasksList(
                    state.tasks || [],
                    state.currentTaskId
                );
            }

            console.log('Popup initialization complete');
        } catch (error) {
            console.error('Failed to initialize popup:', error);
            // Load with default state if initialization fails
            this.navigationManager.showTimerPanel();
            this.taskUIManager.hideTaskForm();
            this.updateState(POPUP_CONSTANTS.DEFAULT_STATE);

            // Ensure empty tasks list is shown
            if (this.taskUIManager) {
                this.taskUIManager.renderTasksList([], null);
            }
        }
    }

    /**
     * Load initial state from background script
     */
    async loadInitialState() {
        try {
            console.log('Loading initial state...');
            const state = await this.messageHandler.sendMessage(ACTIONS.GET_STATE);
            console.log('Received state:', state);
            this.updateState(state);
        } catch (error) {
            console.error('Failed to load initial state:', error);
            throw error;
        }
    }

    /**
     * Update UI with new state
     */
    updateState(state) {
        if (!utils.validateState(state)) {
            console.error('Invalid state received:', state);
            return;
        }

        // Migration: map legacy uiPreferences.tasksFilter 'active' -> 'in-progress'
        try {
            if (
                state.uiPreferences &&
                state.uiPreferences.tasksFilter === 'active'
            ) {
                state.uiPreferences.tasksFilter = 'in-progress';
                // Persist updated preference
                chrome.runtime.sendMessage({
                    action: ACTIONS.UPDATE_UI_PREFERENCES,
                    updates: { tasksFilter: 'in-progress' },
                });
            }
        } catch (e) {
            console.warn('Failed migrating tasksFilter preference', e);
        }

        // Fast path: if only timeLeft changed (normal ticking), avoid updating unrelated UI to prevent layout thrash/flicker
        try {
            if (this._lastState) {
                const prev = this._lastState;
                const fieldsToCompare = [
                    'isRunning',
                    'currentSession',
                    'isWorkSession',
                    'currentTaskId',
                ];
                const structuralUnchanged = fieldsToCompare.every(
                    (k) => prev[k] === state[k]
                );
                const settingsUnchanged =
                    prev.settings === state.settings ||
                    (prev.settings &&
                        state.settings &&
                        [
                            'workDuration',
                            'shortBreak',
                            'longBreak',
                            'longBreakInterval',
                            'autoStart',
                            'theme',
                            'pauseOnIdle',
                            'playSound',
                            'volume',
                        ].every((k) => prev.settings[k] === state.settings[k]));
                const tasksSameRef = prev.tasks === state.tasks; // tasks array not reallocated
                if (
                    structuralUnchanged &&
                    settingsUnchanged &&
                    tasksSameRef &&
                    prev.timeLeft !== state.timeLeft
                ) {
                    // Only timeLeft is different -> update just timer + progress ring
                    this.uiManager.updateTimer(state);
                    this.uiManager.updateProgressRing(state);
                    this._lastState = state; // store new ref
                    return; // Skip rest
                }
            }
        } catch (e) {
            console.warn(
                'Fast-path diff failed; falling back to full update',
                e
            );
        }

        this.uiManager.updateUI(state);
        this.themeManager.applyTheme(state);

        // Update task-related UI
        if (state.tasks && this.taskUIManager) {
            const tasksPanelEl = this.navigationManager?.panels?.tasks;
            const tasksPanelVisible =
                tasksPanelEl && !tasksPanelEl.classList.contains('hidden');
            const shouldSkip = state.isRunning && tasksPanelVisible; // prevent flicker while viewing tasks during active countdown
            if (!shouldSkip) {
                this.taskUIManager.renderTasksList(
                    state.tasks,
                    state.currentTaskId
                );
            }
            // Always update current task summary strip (small top display) regardless
            this.taskUIManager.updateCurrentTaskDisplay(
                state.currentTaskId,
                state.tasks
            );

            // Update tasks count badge
            try {
                const countEl = document.getElementById('tasksCount');
                if (countEl) {
                    const total = state.tasks.length;
                    if (total > 0) {
                        const newText = total > 99 ? '99+' : String(total);
                        const prev = countEl.textContent;
                        countEl.textContent = newText;
                        countEl.classList.remove('hidden');
                        // Accent style for higher counts for visual weight
                        countEl.classList.toggle('badge--accent', total >= 10);
                        // Trigger pulse when number changes
                        if (prev !== newText) {
                            countEl.classList.remove('badge--pulse');
                            // Force reflow to restart animation
                            void countEl.offsetWidth;
                            countEl.classList.add('badge--pulse');
                        }
                    } else {
                        countEl.classList.add('hidden');
                        countEl.classList.remove(
                            'badge--accent',
                            'badge--pulse'
                        );
                    }
                }
            } catch (e) {
                console.warn('Failed updating tasks count badge', e);
            }
        }

        // Toggle compact mode (smaller timer & tighter spacing) when a current task is active
        try {
            const hasCurrent = !!(
                state.currentTaskId &&
                state.tasks &&
                state.tasks.some((t) => t.id === state.currentTaskId)
            );
            // Only toggle if changed to avoid unnecessary layout / transition churn
            if (
                document.body.classList.contains('compact-mode') !== hasCurrent
            ) {
                document.body.classList.toggle('compact-mode', hasCurrent);
            }
            // Always manage has-current-task class
            document.body.classList.toggle('has-current-task', hasCurrent);
            this.syncCurrentTaskLayout();
        } catch (e) {
            console.warn('Failed to toggle compact mode', e);
        }

        // Update hideCompleted toggle button state if present
        if (state.uiPreferences) {
            if (this.taskUIManager && state.uiPreferences.tasksFilter) {
                const incomingFilter = state.uiPreferences.tasksFilter;
                if (this.taskUIManager.currentFilter !== incomingFilter) {
                    this.taskUIManager.clearSelection();
                }
                this.taskUIManager.currentFilter = incomingFilter;
                this.syncFilterButtons(incomingFilter);
            }
        }

        // If statistics panel visible, refresh its contents
        try {
            const statsPanelEl = this.navigationManager?.panels?.stats;
            if (statsPanelEl && !statsPanelEl.classList.contains('hidden')) {
                this.ensureStatisticsHistory().then(() =>
                    this.renderStatisticsPanel(state)
                );
            }
        } catch (e) {
            console.warn('Failed updating statistics panel', e);
        }

        // Store last state for diffing
        this._lastState = state;
    }

    /**
     * Ensure popup stays within 600px by optionally hiding stats
     * if compressed layout still overflows. Runs after state updates
     * and current task visibility changes.
     */
    syncCurrentTaskLayout() {
        // Defer to next frame so DOM has applied style changes
        (window.requestAnimationFrame || window.setTimeout)(() => {
            try {
                const overflow = document.documentElement.scrollHeight > 600;
                document.body.classList.toggle('hide-stats', overflow);
            } catch (e) {
                console.warn('syncCurrentTaskLayout failed', e);
            }
        });
    }

    /**
     * Check notification permissions
     */
    async checkNotifications() {
        await this.notificationController.checkPermissions();
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        this.setupTimerEvents();
        this.setupNavigationEvents();
        this.setupSettingsEvents();
        this.setupTaskEvents();
        this.setupGlobalEvents();
    }

    /**
     * Setup timer control event listeners
     */
    setupTimerEvents() {
        const { startBtn, pauseBtn, resetBtn, skipBreakBtn } =
            this.uiManager.elements;

        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                try {
                    const state =
                        await this.messageHandler.sendMessage(ACTIONS.TOGGLE_TIMER);
                    this.updateState(state);
                } catch (error) {
                    console.error('Failed to start timer:', error);
                }
            });
        }

        if (pauseBtn) {
            pauseBtn.addEventListener('click', async () => {
                try {
                    const state =
                        await this.messageHandler.sendMessage(ACTIONS.TOGGLE_TIMER);
                    this.updateState(state);
                } catch (error) {
                    console.error('Failed to pause timer:', error);
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                try {
                    const state =
                        await this.messageHandler.sendMessage(ACTIONS.RESET_TIMER);
                    this.updateState(state);
                } catch (error) {
                    console.error('Failed to reset timer:', error);
                }
            });
        }

        if (skipBreakBtn) {
            skipBreakBtn.addEventListener('click', async () => {
                try {
                    const state =
                        await this.messageHandler.sendMessage(ACTIONS.SKIP_BREAK);
                    this.updateState(state);
                } catch (error) {
                    console.error('Failed to skip break:', error);
                }
            });
        }
    }

    /**
     * Setup navigation event listeners
     */
    setupNavigationEvents() {
        const settingsBtn = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.settingsBtn
        );
        const tasksBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.tasksBtn);
        const statsBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.statsBtn);
        const dashboardBtn = document.getElementById('dashboardBtn');
        const filtersBar = document.getElementById('tasksFilters');

        if (settingsBtn) {
            settingsBtn.addEventListener('click', async () => {
                this.navigationManager.showSettingsPanel();

                // Load current settings when showing the settings panel
                try {
                    const state =
                        await this.messageHandler.sendMessage(ACTIONS.GET_STATE);
                    // Force update settings form when navigating to settings panel
                    this.uiManager.forceUpdateSettings(state);
                } catch (error) {
                    console.error('Failed to refresh settings:', error);
                }
            });
        }

        if (tasksBtn) {
            tasksBtn.addEventListener('click', async () => {
                console.log('Tasks button clicked');
                this.navigationManager.showTasksPanel();

                // Refresh the task list when showing the tasks panel
                try {
                    const state =
                        await this.messageHandler.sendMessage(ACTIONS.GET_STATE);
                    console.log('Refreshed state for tasks panel:', state);
                    if (state.tasks && this.taskUIManager) {
                        this.taskUIManager.renderTasksList(
                            state.tasks,
                            state.currentTaskId
                        );
                    }
                } catch (error) {
                    console.error('Failed to refresh tasks:', error);
                }
            });
        }

        if (statsBtn) {
            statsBtn.addEventListener('click', async () => {
                this.navigationManager.showStatsPanel();
                try {
                    const state =
                        await this.messageHandler.sendMessage(ACTIONS.GET_STATE);
                    await this.ensureStatisticsHistory();
                    this.renderStatisticsPanel(state);
                } catch (e) {
                    console.error('Failed to open statistics panel', e);
                }
            });
        }

        if (dashboardBtn) {
            dashboardBtn.addEventListener('click', () => {
                if (chrome.runtime.openOptionsPage) {
                    chrome.runtime.openOptionsPage();
                } else {
                    chrome.tabs.create({
                        url: chrome.runtime.getURL('dashboard.html'),
                    });
                }
            });
        }

        if (filtersBar) {
            filtersBar.addEventListener('click', async (e) => {
                const btn = e.target.closest('.tasks-filter');
                if (!btn) {
                    return;
                }
                const selected = btn.getAttribute('data-filter');
                if (!selected) {
                    return;
                }
                // If already active, ignore
                if (btn.classList.contains('is-active')) {
                    return;
                }
                if (this.taskUIManager) {
                    this.taskUIManager.clearSelection();
                }
                try {
                    const state = await this.messageHandler.sendMessage(
                        ACTIONS.UPDATE_UI_PREFERENCES,
                        { uiPreferences: { tasksFilter: selected } }
                    );
                    if (state && this.taskUIManager) {
                        this.taskUIManager.currentFilter = selected;
                        this.syncFilterButtons(selected);
                        this.taskUIManager.renderTasksList(
                            state.tasks,
                            state.currentTaskId
                        );
                    }
                } catch (err) {
                    console.error('Failed to set tasks filter', err);
                }
            });
        }
    }

    syncFilterButtons(activeFilter) {
        const bar = document.getElementById('tasksFilters');
        if (!bar) {
            return;
        }
        bar.querySelectorAll('.tasks-filter').forEach((btn) => {
            const isActive = btn.getAttribute('data-filter') === activeFilter;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive.toString());
        });
    }

    /**
     * Setup task event listeners
     */
    setupTaskEvents() {
        const addTaskBtn = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.addTaskBtn
        );
        const closeTaskFormBtn = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.closeTaskFormBtn
        );
        const cancelTaskBtn = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.cancelTaskBtn
        );
        const taskForm = utils.getElement(POPUP_CONSTANTS.SELECTORS.taskForm);
        const clearTaskBtn = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.clearTaskBtn
        );
        const taskFormModal = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.taskFormModal
        );
        const clearCompletedBtn = document.getElementById('clearCompletedBtn');

        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', () => {
                this.taskUIManager.showTaskForm();
            });
        }

        if (closeTaskFormBtn) {
            closeTaskFormBtn.addEventListener('click', () => {
                this.taskUIManager.hideTaskForm();
            });
        }

        if (cancelTaskBtn) {
            cancelTaskBtn.addEventListener('click', () => {
                this.taskUIManager.hideTaskForm();
            });
        }

        if (clearTaskBtn) {
            clearTaskBtn.addEventListener('click', async () => {
                try {
                    const state = await this.messageHandler.sendMessage(
                        ACTIONS.SET_CURRENT_TASK,
                        { taskId: null }
                    );

                    // Update UI immediately with the response
                    this.updateState(state);

                    // Also update task UI components if available
                    if (this.taskUIManager) {
                        this.taskUIManager.renderTasksList(
                            state.tasks || [],
                            state.currentTaskId
                        );
                        this.taskUIManager.updateCurrentTaskDisplay(
                            state.currentTaskId,
                            state.tasks || []
                        );
                    }
                    document.body.classList.remove('compact-mode');
                    document.body.classList.remove('has-current-task');
                    (window.requestAnimationFrame || window.setTimeout)(() => {
                        window._popupController?.syncCurrentTaskLayout?.();
                    });
                } catch (error) {
                    console.error('Failed to clear current task:', error);
                }
            });
        }

        if (taskForm) {
            taskForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const taskData = {
                    title: document.getElementById('taskTitle').value.trim(),
                    description: document
                        .getElementById('taskDescription')
                        .value.trim(),
                    estimatedPomodoros:
                        parseInt(
                            document.getElementById('taskEstimate').value
                        ) || 1,
                };

                if (!taskData.title) {
                    alert('Please enter a task title');
                    return;
                }

                await this.taskUIManager.handleTaskFormSubmit(taskData);
            });
        }

        // Close modal when clicking outside
        if (taskFormModal) {
            taskFormModal.addEventListener('click', (e) => {
                if (e.target === taskFormModal) {
                    this.taskUIManager.hideTaskForm();
                }
            });
        }

        if (clearCompletedBtn) {
            clearCompletedBtn.addEventListener('click', async () => {
                if (
                    !window.confirm(
                        'Remove all completed tasks? This cannot be undone.'
                    )
                ) {
                    return;
                }
                try {
                    const state = await this.messageHandler.sendMessage(
                        ACTIONS.CLEAR_COMPLETED_TASKS
                    );
                    this.updateState(state);
                } catch (e) {
                    console.error('Failed to clear completed tasks', e);
                }
            });
        }
    }

    /**
     * Setup settings event listeners
     */
    setupSettingsEvents() {
        const saveBtn = this.uiManager.elements.saveSettingsBtn;
        const resetBtn = this.uiManager.elements.resetSettingsBtn;

        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                try {
                    const settings = this.settingsManager.getSettings();
                    const validation =
                        this.settingsManager.validateSettings(settings);

                    if (!validation.isValid) {
                        notifyError(
                            'Settings validation failed:\n' +
                                validation.errors.join('\n')
                        );
                        return;
                    }

                    const permissionGranted =
                        await requestJiraPermission(settings);
                    if (!permissionGranted) {
                        notifyError(
                            'Jira permission not granted. Allow access to your Jira site to enable syncing.'
                        );
                        return;
                    }

                    const state = await this.messageHandler.sendMessage(
                        ACTIONS.SAVE_SETTINGS,
                        { settings }
                    );
                    this.updateState(state);
                    this.navigationManager.showTimerPanel();
                } catch (error) {
                    console.error('Failed to save settings:', error);
                    notifyError('Failed to save settings. Please try again.');
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                const confirmed = window.confirm(
                    'Reset all settings to their default values?'
                );
                if (!confirmed) {
                    return;
                }

                const defaults = {
                    ...POPUP_CONSTANTS.DEFAULT_STATE.settings,
                };
                const optimisticState = this._lastState
                    ? { ...this._lastState, settings: defaults }
                    : {
                          ...POPUP_CONSTANTS.DEFAULT_STATE,
                          settings: defaults,
                      };
                this.uiManager.forceUpdateSettings(optimisticState);

                try {
                    const state = await this.messageHandler.sendMessage(
                        ACTIONS.SAVE_SETTINGS,
                        { settings: defaults }
                    );
                    this.updateState(state);
                    notifySuccess('Settings reset to defaults.');
                } catch (error) {
                    console.error('Failed to reset settings:', error);
                    notifyError('Failed to reset settings. Please try again.');
                    try {
                        const state =
                            await this.messageHandler.sendMessage(ACTIONS.GET_STATE);
                        this.updateState(state);
                    } catch (refreshError) {
                        console.error(
                            'Failed to refresh settings after reset error:',
                            refreshError
                        );
                    }
                }
            });
        }

        // Clear data button
        const clearDataBtn = this.uiManager.elements.clearDataBtn;
        if (clearDataBtn) {
            clearDataBtn.addEventListener('click', async () => {
                const confirmed = window.confirm(
                    'Are you sure you want to clear all statistics data?\n\n' +
                        'This will permanently delete:\n' +
                        '• All completed session counts\n' +
                        '• All focus time records\n' +
                        '• Historical data for all dates\n\n' +
                        'This action cannot be undone.'
                );

                if (confirmed) {
                    try {
                        await this.messageHandler.sendMessage(
                            ACTIONS.CLEAR_STATISTICS
                        );
                        notifySuccess(
                            'All statistics data has been cleared successfully.'
                        );

                        // Refresh the UI to show updated statistics
                        const state =
                            await this.messageHandler.sendMessage(ACTIONS.GET_STATE);
                        this.updateState(state);
                    } catch (error) {
                        console.error(
                            'Failed to clear statistics data:',
                            error
                        );
                        notifyError(
                            'Failed to clear statistics data. Please try again.'
                        );
                    }
                }
            });
        }
    }

    /**
     * Setup global event listeners
     */
    setupGlobalEvents() {
        // Listen for timer updates from background script
        document.addEventListener('timerUpdate', (event) => {
            this.updateState(event.detail);
        });

        // Handle keyboard navigation
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(event) {
        // Spacebar to toggle timer
        if (
            event.code === 'Space' &&
            !event.target.matches('input, textarea')
        ) {
            event.preventDefault();
            this.uiManager.elements.startBtn?.click() ||
                this.uiManager.elements.pauseBtn?.click();
        }

        // Escape to go back to timer panel
        if (event.code === 'Escape') {
            // Close modal first if open
            const modal = utils.getElement(
                POPUP_CONSTANTS.SELECTORS.taskFormModal
            );
            if (modal && !modal.classList.contains('hidden')) {
                this.taskUIManager.hideTaskForm();
            } else {
                this.navigationManager.showTimerPanel();
            }
        }

        // R to reset timer
        if (event.code === 'KeyR' && event.ctrlKey) {
            event.preventDefault();
            this.uiManager.elements.resetBtn?.click();
        }

        // T to open tasks panel
        if (event.code === 'KeyT' && event.ctrlKey) {
            event.preventDefault();
            this.navigationManager.showTasksPanel();
        }
    }

    /**
     * Fetch & cache statistics history (once per popup session)
     */
    async ensureStatisticsHistory() {
        if (this._statsHistoryCache) {
            return this._statsHistoryCache;
        }
        try {
            const resp = await this.messageHandler.sendMessage(
                ACTIONS.GET_STATISTICS_HISTORY
            );
            this._statsHistoryCache = resp && resp.history ? resp.history : {};
            return this._statsHistoryCache;
        } catch (e) {
            console.warn('Failed to fetch statistics history', e);
            this._statsHistoryCache = {};
            return this._statsHistoryCache;
        }
    }

    /**
     * Build array of recent date strings (YYYY-MM-DD) inclusive of today
     */
    buildRecentDates(days = 7) {
        const dates = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }
        return dates;
    }

    /**
     * Render statistics summary cards + 7-day chart
     */
    renderStatisticsPanel(state) {
        const summaryEl = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.statsSummary
        );
        const chartEl = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.stats7DayChart
        );
        const historySection = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.statsHistorySection
        );
        if (!summaryEl) {
            return;
        }

        const todayCompleted = state.statistics?.completedToday || 0;
        const todayFocus = state.statistics?.focusTimeToday || 0;
        const history = this._statsHistoryCache || {};
        let totalCompleted = 0,
            totalFocus = 0,
            longestFocus = 0,
            activeDays = 0;
        Object.values(history).forEach((day) => {
            if (!day) {
                return;
            }
            const c = day.completedSessions || 0;
            const f = day.focusTimeMinutes || 0;
            if (c > 0 || f > 0) {
                activeDays++;
            }
            totalCompleted += c;
            totalFocus += f;
            if (f > longestFocus) {
                longestFocus = f;
            }
        });
        const productivityRate = activeDays
            ? (totalCompleted / activeDays).toFixed(1)
            : '0.0';

        summaryEl.innerHTML = `
            <div class="stat-grid">
                <div class="stat-card" aria-label="Completed today ${todayCompleted} pomodoros">
                    <div class="stat-card__label">Today</div>
                    <div class="stat-card__value">${todayCompleted}</div>
                    <div class="stat-card__sub">Pomodoros</div>
                </div>
                <div class="stat-card" aria-label="Focus time today ${utils.formatFocusTime(todayFocus)}">
                    <div class="stat-card__label">Focus Today</div>
                    <div class="stat-card__value">${utils.formatFocusTime(todayFocus)}</div>
                    <div class="stat-card__sub">Time</div>
                </div>
                <div class="stat-card" aria-label="Active days ${activeDays}">
                    <div class="stat-card__label">Active Days</div>
                    <div class="stat-card__value">${activeDays}</div>
                    <div class="stat-card__sub">Last 30d</div>
                </div>
                <div class="stat-card" aria-label="Total focus time ${utils.formatFocusTime(totalFocus)}">
                    <div class="stat-card__label">Total Focus</div>
                    <div class="stat-card__value">${utils.formatFocusTime(totalFocus)}</div>
                    <div class="stat-card__sub">Across Days</div>
                </div>
                <div class="stat-card" aria-label="Longest day focus ${utils.formatFocusTime(longestFocus)}">
                    <div class="stat-card__label">Longest Day</div>
                    <div class="stat-card__value">${utils.formatFocusTime(longestFocus)}</div>
                    <div class="stat-card__sub">Focus Time</div>
                </div>
                <div class="stat-card" aria-label="Average pomodoros per active day ${productivityRate}">
                    <div class="stat-card__label">Avg / Day</div>
                    <div class="stat-card__value">${productivityRate}</div>
                    <div class="stat-card__sub">Pomodoros</div>
                </div>
            </div>`;

        if (chartEl) {
            const recentDates = this.buildRecentDates(7);
            const chartData = recentDates.map((date) => {
                const day = history[date] || {
                    completedSessions: 0,
                    focusTimeMinutes: 0,
                };
                return {
                    date,
                    completed: day.completedSessions || 0,
                    focus: day.focusTimeMinutes || 0,
                };
            });
            const maxFocus = Math.max(30, ...chartData.map((d) => d.focus));
            const maxCompleted = Math.max(
                1,
                ...chartData.map((d) => d.completed)
            );
            chartEl.innerHTML = chartData
                .map((d) => {
                    const focusPct = d.focus
                        ? Math.round((d.focus / maxFocus) * 100)
                        : 0;
                    const completedPct = d.completed
                        ? Math.round((d.completed / maxCompleted) * 100)
                        : 0;
                    const dateObj = new Date(d.date);
                    const label = dateObj.toLocaleDateString(undefined, {
                        weekday: 'short',
                    });
                    return `
                    <div class="chart-bar" role="group" aria-label="${label} ${d.focus} minutes focus, ${d.completed} pomodoros">
                        <div class="chart-bar__col">
                            <div class="chart-bar__value" style="height:${focusPct}%" aria-label="Focus ${d.focus} minutes" title="${d.focus}m"></div>
                            <div class="chart-bar__label" aria-hidden="true">${label}</div>
                        </div>
                        <div class="chart-bar__col chart-bar__col--sessions">
                            <div class="chart-bar__value chart-bar__value--sessions" style="height:${completedPct}%" aria-label="${d.completed} pomodoros" title="${d.completed}"></div>
                        </div>
                    </div>`;
                })
                .join('');
        }

        if (historySection) {
            historySection.classList.toggle(
                'hidden',
                Object.keys(history).length === 0
            );
        }
    }
}

export function initializePopup() {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM Content Loaded - initializing popup');
        try {
            const controller = new PopupController();
            // Expose for layout sync calls from task UI operations
            window._popupController = controller;
        } catch (error) {
            console.error('Failed to create PopupController:', error);
        }
    });
}
