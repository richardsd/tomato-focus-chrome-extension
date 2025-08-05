/**
 * Constants and configuration for the popup
 */
const POPUP_CONSTANTS = {
    RETRY_DELAY: 100,
    ANIMATION_DURATION: 300,
    UPDATE_DEBOUNCE: 50,
    PROGRESS_RING_RADIUS: 90,
    SELECTORS: {
        timer: '#timer',
        startBtn: '#startBtn',
        pauseBtn: '#pauseBtn',
        resetBtn: '#resetBtn',
        skipBreakBtn: '#skipBreakBtn',
        sessionCount: '#sessionCount',
        saveSettingsBtn: '#saveSettings',
        notificationStatus: '#notificationStatus',
        notificationMessage: '#notificationMessage',
        timerPanel: '#timerPanel',
        settingsPanel: '#settingsPanel',
        settingsBtn: '#settingsBtn',
        backBtn: '#backBtn',
        progressRing: '.timer__progress-ring-progress',
        progressRingBackground: '.timer__progress-ring-background',
        sessionIcon: '#sessionIcon',
        sessionTitle: '#sessionTitle'
    },
    THEMES: {
        WORK: {
            iconSrc: 'icons/icon.svg',
            iconAlt: 'Tomato',
            title: 'Tomato Focus',
            className: ''
        },
        BREAK: {
            iconSrc: 'icons/green-icon.svg',
            iconAlt: 'Green Tomato Break',
            title: 'Break Time',
            className: 'break-mode'
        }
    },
    DEFAULT_STATE: {
        isRunning: false,
        timeLeft: 25 * 60,
        currentSession: 1,
        isWorkSession: true,
        settings: {
            workDuration: 25,
            shortBreak: 5,
            longBreak: 15,
            longBreakInterval: 4,
            autoStart: false,
            lightTheme: false
        }
    }
};

/**
 * Utility functions
 */
const utils = {
    /**
     * Format time in MM:SS format
     */
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    },

    /**
     * Calculate progress ring circumference
     */
    getCircumference(radius = POPUP_CONSTANTS.PROGRESS_RING_RADIUS) {
        return 2 * Math.PI * radius;
    },

    /**
     * Debounce function calls
     */
    debounce(func, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    },

    /**
     * Get element safely with error handling
     */
    getElement(selector) {
        const element = document.querySelector(selector);
        if (!element) {
            console.warn(`Element not found: ${selector}`);
        }
        return element;
    },

    /**
     * Validate timer state object
     */
    validateState(state) {
        return state && 
               typeof state.isRunning === 'boolean' &&
               typeof state.timeLeft === 'number' &&
               typeof state.currentSession === 'number' &&
               typeof state.isWorkSession === 'boolean' &&
               state.settings && typeof state.settings === 'object';
    }
};

/**
 * Handles communication with the background script
 */
class MessageHandler {
    constructor() {
        this.setupMessageListener();
    }

    /**
     * Send message to background script with retry logic
     */
    async sendMessage(action, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action, ...data }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('Message failed:', chrome.runtime.lastError.message);
                    // Retry once after a short delay
                    setTimeout(() => {
                        chrome.runtime.sendMessage({ action, ...data }, (retryResponse) => {
                            if (chrome.runtime.lastError) {
                                console.error('Retry failed:', chrome.runtime.lastError.message);
                                if (action === 'getState') {
                                    resolve(POPUP_CONSTANTS.DEFAULT_STATE);
                                } else {
                                    reject(new Error(chrome.runtime.lastError.message));
                                }
                            } else {
                                resolve(retryResponse);
                            }
                        });
                    }, POPUP_CONSTANTS.RETRY_DELAY);
                } else {
                    resolve(response);
                }
            });
        });
    }

    /**
     * Setup listener for background script messages
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request) => {
            if (request.action === 'updateTimer' && request.state) {
                // Emit custom event for state updates
                document.dispatchEvent(new CustomEvent('timerUpdate', { 
                    detail: request.state 
                }));
            }
        });
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
        const theme = state.isWorkSession ? 
            POPUP_CONSTANTS.THEMES.WORK : 
            POPUP_CONSTANTS.THEMES.BREAK;

        // Update body class
        this.body.className = '';
        if (theme.className) {
            this.body.classList.add(theme.className);
        }

        // Handle light theme setting
        if (state.settings.lightTheme) {
            this.body.classList.add('light-theme');
        }

        // Update session icon and title
        this.updateSessionDisplay(state, theme);
    }

    /**
     * Update session icon and title
     */
    updateSessionDisplay(state, theme) {
        const sessionIcon = utils.getElement(POPUP_CONSTANTS.SELECTORS.sessionIcon);
        const sessionTitle = utils.getElement(POPUP_CONSTANTS.SELECTORS.sessionTitle);

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
                const isLongBreak = state.currentSession % state.settings.longBreakInterval === 0;
                sessionTitle.textContent = isLongBreak ? 'Long Break' : 'Short Break';
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
        this.debouncedUpdate = utils.debounce(this.updateProgressRing.bind(this), POPUP_CONSTANTS.UPDATE_DEBOUNCE);
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
        this.updateSessionCount(state);
        this.updateButtons(state);
        this.updateSettings(state);
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
    updateSessionCount(state) {
        if (this.elements.sessionCount) {
            this.elements.sessionCount.textContent = `Session: ${state.currentSession}`;
        }
    }

    /**
     * Update button states and visibility
     */
    updateButtons(state) {
        // Update start/pause buttons
        if (state.isRunning) {
            this.hideElement(this.elements.startBtn);
            this.showElement(this.elements.pauseBtn);
        } else {
            this.hideElement(this.elements.pauseBtn);
            this.showElement(this.elements.startBtn);
            
            // Update start button text (Start/Resume)
            if (this.elements.startBtn) {
                const fullDuration = this.calculateFullDuration(state);
                const isResuming = state.timeLeft < fullDuration && state.timeLeft > 0;
                this.elements.startBtn.textContent = isResuming ? 'Resume' : 'Start';
            }
        }

        // Update skip break button visibility
        const shouldShowSkipBreak = !state.isWorkSession && state.timeLeft > 0;
        if (shouldShowSkipBreak) {
            this.showElement(this.elements.skipBreakBtn);
        } else {
            this.hideElement(this.elements.skipBreakBtn);
        }
    }

    /**
     * Update settings form values
     */
    updateSettings(state) {
        const settingsInputs = {
            workDuration: state.settings.workDuration,
            shortBreak: state.settings.shortBreak,
            longBreak: state.settings.longBreak,
            longBreakInterval: state.settings.longBreakInterval,
            autoStart: state.settings.autoStart,
            lightTheme: state.settings.lightTheme
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
        if (!progressRing) {return;}

        const totalDuration = this.calculateFullDuration(state);
        const progress = state.timeLeft / totalDuration;
        const offset = this.circumference * (1 - progress);

        progressRing.style.strokeDashoffset = offset;
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
        const isLongBreak = state.currentSession % state.settings.longBreakInterval === 0;
        return isLongBreak ? state.settings.longBreak * 60 : state.settings.shortBreak * 60;
    }

    /**
     * Show element with animation
     */
    showElement(element) {
        if (element) {
            element.style.display = 'inline-block';
            element.style.opacity = '1';
        }
    }

    /**
     * Hide element with animation
     */
    hideElement(element) {
        if (element) {
            element.style.display = 'none';
            element.style.opacity = '0';
        }
    }
}
/**
 * Manages notification status and messages
 */
class NotificationController {
    constructor() {
        this.statusElement = utils.getElement(POPUP_CONSTANTS.SELECTORS.notificationStatus);
        this.messageElement = utils.getElement(POPUP_CONSTANTS.SELECTORS.notificationMessage);
    }

    /**
     * Check and display notification permissions status
     */
    async checkPermissions() {
        try {
            const messageHandler = new MessageHandler();
            const response = await messageHandler.sendMessage('checkNotifications');
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
        if (!this.statusElement || !this.messageElement) {return;}

        if (permissionLevel !== 'granted') {
            this.statusElement.style.display = 'block';
            this.statusElement.className = 'mt-4 p-3 rounded-lg text-sm bg-yellow-100 border border-yellow-400';
            
            const isMac = navigator.platform.includes('Mac');
            this.messageElement.innerHTML = isMac ? this.getMacInstructions() : this.getGeneralInstructions();
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
class SettingsManager {
    constructor() {
        this.form = this.createFormInterface();
    }

    /**
     * Create settings form interface
     */
    createFormInterface() {
        const inputs = {
            workDuration: document.getElementById('workDuration'),
            shortBreak: document.getElementById('shortBreak'),
            longBreak: document.getElementById('longBreak'),
            longBreakInterval: document.getElementById('longBreakInterval'),
            autoStart: document.getElementById('autoStart'),
            lightTheme: document.getElementById('lightTheme')
        };

        return { inputs };
    }

    /**
     * Get current settings from form
     */
    getSettings() {
        const { inputs } = this.form;
        
        return {
            workDuration: parseInt(inputs.workDuration?.value) || 25,
            shortBreak: parseInt(inputs.shortBreak?.value) || 5,
            longBreak: parseInt(inputs.longBreak?.value) || 15,
            longBreakInterval: parseInt(inputs.longBreakInterval?.value) || 4,
            autoStart: inputs.autoStart?.checked || false,
            lightTheme: inputs.lightTheme?.checked || false
        };
    }

    /**
     * Validate settings values
     */
    validateSettings(settings) {
        const errors = [];

        if (settings.workDuration < 1 || settings.workDuration > 60) {
            errors.push('Work duration must be between 1 and 60 minutes');
        }
        if (settings.shortBreak < 1 || settings.shortBreak > 30) {
            errors.push('Short break must be between 1 and 30 minutes');
        }
        if (settings.longBreak < 1 || settings.longBreak > 60) {
            errors.push('Long break must be between 1 and 60 minutes');
        }
        if (settings.longBreakInterval < 1 || settings.longBreakInterval > 10) {
            errors.push('Sessions before long break must be between 1 and 10');
        }

        return { isValid: errors.length === 0, errors };
    }
}

/**
 * Manages panel navigation
 */
class NavigationManager {
    constructor() {
        this.panels = {
            timer: utils.getElement(POPUP_CONSTANTS.SELECTORS.timerPanel),
            settings: utils.getElement(POPUP_CONSTANTS.SELECTORS.settingsPanel)
        };
    }

    /**
     * Show timer panel
     */
    showTimerPanel() {
        if (this.panels.timer) {this.panels.timer.style.display = 'block';}
        if (this.panels.settings) {this.panels.settings.style.display = 'none';}
    }

    /**
     * Show settings panel
     */
    showSettingsPanel() {
        if (this.panels.timer) {this.panels.timer.style.display = 'none';}
        if (this.panels.settings) {this.panels.settings.style.display = 'block';}
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
        this.notificationController = new NotificationController();
        this.settingsManager = new SettingsManager();
        this.navigationManager = new NavigationManager();
        
        this.init();
    }

    /**
     * Initialize the popup
     */
    async init() {
        try {
            await this.loadInitialState();
            this.setupEventListeners();
            this.checkNotifications();
        } catch (error) {
            console.error('Failed to initialize popup:', error);
            // Load with default state if initialization fails
            this.updateState(POPUP_CONSTANTS.DEFAULT_STATE);
        }
    }

    /**
     * Load initial state from background script
     */
    async loadInitialState() {
        try {
            const state = await this.messageHandler.sendMessage('getState');
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

        this.uiManager.updateUI(state);
        this.themeManager.applyTheme(state);
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
        this.setupGlobalEvents();
    }

    /**
     * Setup timer control event listeners
     */
    setupTimerEvents() {
        const { startBtn, pauseBtn, resetBtn, skipBreakBtn } = this.uiManager.elements;

        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                try {
                    const state = await this.messageHandler.sendMessage('toggleTimer');
                    this.updateState(state);
                } catch (error) {
                    console.error('Failed to start timer:', error);
                }
            });
        }

        if (pauseBtn) {
            pauseBtn.addEventListener('click', async () => {
                try {
                    const state = await this.messageHandler.sendMessage('toggleTimer');
                    this.updateState(state);
                } catch (error) {
                    console.error('Failed to pause timer:', error);
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                try {
                    const state = await this.messageHandler.sendMessage('resetTimer');
                    this.updateState(state);
                } catch (error) {
                    console.error('Failed to reset timer:', error);
                }
            });
        }

        if (skipBreakBtn) {
            skipBreakBtn.addEventListener('click', async () => {
                try {
                    const state = await this.messageHandler.sendMessage('skipBreak');
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
        const settingsBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.settingsBtn);
        const backBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.backBtn);

        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.navigationManager.showSettingsPanel();
            });
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.navigationManager.showTimerPanel();
            });
        }
    }

    /**
     * Setup settings event listeners
     */
    setupSettingsEvents() {
        const saveBtn = this.uiManager.elements.saveSettingsBtn;

        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                try {
                    const settings = this.settingsManager.getSettings();
                    const validation = this.settingsManager.validateSettings(settings);

                    if (!validation.isValid) {
                        alert('Settings validation failed:\n' + validation.errors.join('\n'));
                        return;
                    }

                    const state = await this.messageHandler.sendMessage('saveSettings', { settings });
                    this.updateState(state);
                    this.navigationManager.showTimerPanel();
                } catch (error) {
                    console.error('Failed to save settings:', error);
                    alert('Failed to save settings. Please try again.');
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
        if (event.code === 'Space' && !event.target.matches('input, textarea')) {
            event.preventDefault();
            this.uiManager.elements.startBtn?.click() || this.uiManager.elements.pauseBtn?.click();
        }
        
        // Escape to go back to timer panel
        if (event.code === 'Escape') {
            this.navigationManager.showTimerPanel();
        }
        
        // R to reset timer
        if (event.code === 'KeyR' && event.ctrlKey) {
            event.preventDefault();
            this.uiManager.elements.resetBtn?.click();
        }
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
