/**
 * Constants and configuration for the popup
 */
const POPUP_CONSTANTS = {
    RETRY_DELAY: 100,
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
        clearDataBtn: '#clearDataBtn',
        notificationStatus: '#notificationStatus',
        notificationMessage: '#notificationMessage',
        timerPanel: '#timerPanel',
        settingsPanel: '#settingsPanel',
        tasksPanel: '#tasksPanel',
        settingsBtn: '#settingsBtn',
        tasksBtn: '#tasksBtn',
        backBtn: '#backBtn',
        backFromTasksBtn: '#backFromTasksBtn',
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
        cancelTaskBtn: '#cancelTaskBtn'
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
        currentTaskId: null,
        tasks: [],
        settings: {
            workDuration: 25,
            shortBreak: 5,
            longBreak: 15,
            longBreakInterval: 4,
            autoStart: false,
            theme: 'system',
            pauseOnIdle: true,
            playSound: true,
            volume: 1
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
     * Format focus time for statistics display
     */
    formatFocusTime(minutes) {
        if (minutes < 60) {
            return `${minutes}m`;
        } else {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
        }
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
        // Note: statistics, tasks, and currentTaskId are optional and may be null during initialization
    }
};

/**
 * Manages task UI operations
 */
class TaskUIManager {
    constructor(messageHandler) {
        this.messageHandler = messageHandler;
        this.currentEditingTaskId = null;
        this.currentFilter = 'all';
    }

    /**
     * Render the tasks list
     */
    renderTasksList(tasks, currentTaskId) {
        console.log('renderTasksList called with:', { tasks, currentTaskId });
        const tasksList = utils.getElement(POPUP_CONSTANTS.SELECTORS.tasksList);
        if (!tasksList) {
            console.warn('tasksList element not found');
            return;
        }
        // Apply filter
        let displayTasks = tasks;
        if (this.currentFilter === 'in-progress') {
            displayTasks = tasks.filter(t => !t.isCompleted);
        } else if (this.currentFilter === 'completed') {
            displayTasks = tasks.filter(t => t.isCompleted);
        }

        console.log('Tasks list element found, rendering with filter:', this.currentFilter);

        if (!displayTasks || displayTasks.length === 0) {
            console.log('No tasks found, showing empty state');
            tasksList.innerHTML = `
                <div class="tasks-empty">
                    <div class="tasks-empty__icon">📋</div>
                    <div class="tasks-empty__text">No tasks yet</div>
                    <div class="tasks-empty__subtext">Add a task to start tracking your focus sessions</div>
                </div>
            `;
            return;
        }

        console.log('Rendering', displayTasks.length, 'tasks (filtered)');
        const tasksHTML = displayTasks.map(task => this.renderTaskItem(task, currentTaskId)).join('');
        console.log('Generated HTML:', tasksHTML);
        tasksList.innerHTML = tasksHTML;
        console.log('TasksList innerHTML after setting:', tasksList.innerHTML);

        // Add event listeners for task items
        this.attachTaskEventListeners();

        // Toggle visibility of clear completed button
        const hasCompleted = tasks.some(t => t.isCompleted);
        const clearCompletedBtn = document.getElementById('clearCompletedBtn');
        if (clearCompletedBtn) {
            if (hasCompleted) {
                clearCompletedBtn.classList.remove('hidden');
            } else {
                clearCompletedBtn.classList.add('hidden');
            }
        }
    }

    /**
     * Render a single task item
     */
    renderTaskItem(task, currentTaskId) {
        const isCurrentTask = task.id === currentTaskId;
        const progress = `${task.completedPomodoros}/${task.estimatedPomodoros}`;
        const statusClass = task.isCompleted ? 'completed' : (task.completedPomodoros > 0 ? 'in-progress' : 'pending');
        const statusText = task.isCompleted ? 'Completed' : (task.completedPomodoros > 0 ? 'In progress' : 'Pending');

        // Truncate title if it's too long (max 50 characters)
        const truncatedTitle = task.title.length > 50 ? task.title.substring(0, 47) + '...' : task.title;

        return `
            <div class="task-item ${isCurrentTask ? 'task-item--current' : ''} ${task.isCompleted ? 'task-item--completed' : ''}"
                 data-task-id="${task.id}" aria-label="Task: ${this.escapeHtml(task.title)}. ${statusText}. Progress ${progress} pomodoros." tabindex="0">
                <div class="task-item__header">
                    <div class="task-item__title ${task.isCompleted ? 'completed' : ''}" title="${this.escapeHtml(task.title)}">
                        ${this.escapeHtml(truncatedTitle)}
                    </div>
                    <div class="task-item__menu" data-task-id="${task.id}">
                        <button class="task-item__menu-trigger" aria-haspopup="true" aria-expanded="false" aria-label="Task actions menu" title="Actions">⋮</button>
                        <div class="task-item__menu-dropdown" role="menu" aria-label="Task actions">
                            <button class="task-item__action task-select" role="menuitem" data-task-id="${task.id}" aria-pressed="${isCurrentTask}">🎯 ${task.isCompleted ? 'Reopen & Select' : (isCurrentTask ? 'Unset Current' : 'Set Current')}</button>
                            ${!task.isCompleted ? `<button class="task-item__action task-complete" role="menuitem" data-task-id="${task.id}">✅ Complete</button>` : ''}
                            ${task.isCompleted ? `<button class="task-item__action task-reopen" role="menuitem" data-task-id="${task.id}">↺ Reopen</button>` : ''}
                            <button class="task-item__action task-edit" role="menuitem" data-task-id="${task.id}">✏️ Edit</button>
                            <button class="task-item__action task-delete" role="menuitem" data-task-id="${task.id}">🗑 Delete</button>
                        </div>
                    </div>
                </div>
                ${task.description ? `<div class="task-item__description" data-has-description="true" title="${this.escapeHtml(task.description)}">${this.escapeHtml(task.description)}</div>` : ''}
                <div class="task-item__footer">
                    <div class="task-item__progress" aria-label="Progress: ${progress} pomodoros; Status: ${statusText}">
                        <div class="task-item__pomodoros" aria-hidden="false">🍅 ${progress}</div>
                        <div class="task-item__status ${statusClass}" role="status">${statusText}</div>
                    </div>
                </div>
            </div>
        `;
    }    /**
     * Attach event listeners to task items
     */
    attachTaskEventListeners() {
        // Select task buttons
        document.querySelectorAll('.task-select').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.selectTask(taskId);
            });
        });

        // Complete task buttons
        document.querySelectorAll('.task-complete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.toggleTaskCompletion(taskId, true);
            });
        });

        // Reopen task buttons
        document.querySelectorAll('.task-reopen').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.toggleTaskCompletion(taskId, false);
            });
        });

        // Edit task buttons
        document.querySelectorAll('.task-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.editTask(taskId);
            });
        });

        // Delete task buttons
        document.querySelectorAll('.task-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.deleteTask(taskId);
            });
        });

        // Task item click to select
        document.querySelectorAll('.task-item:not(.task-item--completed)').forEach(item => {
            item.addEventListener('click', () => {
                const taskId = item.dataset.taskId;
                this.selectTask(taskId);
            });
        });

        // Complete task on double-click
        document.querySelectorAll('.task-item:not(.task-item--completed)').forEach(item => {
            item.addEventListener('dblclick', () => {
                const taskId = item.dataset.taskId;
                this.toggleTaskCompletion(taskId, true);
            });
        });

        // Setup expandable descriptions & menus after tasks render
        this.setupDescriptionToggles();
        this.setupMenus();
    }

    /**
     * Setup description expand / collapse toggles for overflowing text
     */
    setupDescriptionToggles() {
        document.querySelectorAll('.task-item__description').forEach(desc => {
            if (desc.dataset.processed === 'true') { return; }

            const rawText = (desc.textContent || '').trim();
            if (!rawText) { desc.dataset.processed = 'true'; return; }

            // Wrap contents if not already
            if (!desc.querySelector('.task-item__desc-text')) {
                const wrapper = document.createElement('span');
                wrapper.className = 'task-item__desc-text';
                while (desc.firstChild) { wrapper.appendChild(desc.firstChild); }
                desc.appendChild(wrapper);
            }

            // Remove any previous state
            desc.classList.remove('clamped','expanded');

            // Measure full height
            const fullHeight = desc.scrollHeight;
            const style = window.getComputedStyle(desc);
            let lineHeight = parseFloat(style.lineHeight);
            if (Number.isNaN(lineHeight)) { lineHeight = 16; }

            // Apply clamp to compute visible height
            desc.classList.add('clamped');
            const visibleHeight = desc.offsetHeight; // offsetHeight reflects the clamped box

            // Determine overflow if more than ~0.5 line hidden OR char heuristic fallback
            const hiddenHeight = fullHeight - visibleHeight;
            const charFallback = rawText.length > 120; // if very long text, assume overflow in case measurements fail
            const isOverflowing = hiddenHeight > (lineHeight * 0.5) || charFallback;

            if (!isOverflowing) {
                desc.classList.remove('clamped');
                desc.dataset.processed = 'true';
                return;
            }

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'task-item__desc-toggle-inline';
            toggle.textContent = 'more';
            toggle.setAttribute('aria-expanded','false');
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                if (expanded) {
                    desc.classList.add('clamped');
                    desc.classList.remove('expanded');
                    toggle.textContent = 'more';
                    toggle.setAttribute('aria-expanded','false');
                } else {
                    desc.classList.remove('clamped');
                    desc.classList.add('expanded');
                    toggle.textContent = 'less';
                    toggle.setAttribute('aria-expanded','true');
                }
            });
            desc.insertAdjacentElement('afterend', toggle);
            desc.dataset.processed = 'true';
        });
    }

    /**
     * Setup hamburger menu dropdown interactions
     */
    setupMenus() {
        const triggers = document.querySelectorAll('.task-item__menu-trigger');
        triggers.forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = trigger.closest('.task-item__menu');
                const expanded = trigger.getAttribute('aria-expanded') === 'true';
                this.closeAllMenus();
                if (!expanded) {
                    trigger.setAttribute('aria-expanded','true');
                    menu.classList.add('open');
                    const card = trigger.closest('.task-item');
                    if (card) { card.classList.add('task-item--menu-open'); }
                }
            });
        });
        if (!this._menuOutsideHandler) {
            this._menuOutsideHandler = (e) => {
                if (!e.target.closest('.task-item__menu')) { this.closeAllMenus(); }
            };
            document.addEventListener('click', this._menuOutsideHandler);
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.closeAllMenus(); } });
        }
    }

    closeAllMenus() {
        document.querySelectorAll('.task-item__menu.open').forEach(menu => {
            menu.classList.remove('open');
            const card = menu.closest('.task-item');
            if (card) { card.classList.remove('task-item--menu-open'); }
        });
        document.querySelectorAll('.task-item__menu-trigger[aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded','false'));
    }

    /**
     * Select a task as current
     */
    async selectTask(taskId) {
        try {
            // Fetch latest full state to determine current selection
            const stateResponse = await this.messageHandler.sendMessage('getState');
            const tasks = stateResponse.tasks || [];
            const task = tasks.find(t => t.id === taskId);
            const currentTaskId = stateResponse.currentTaskId;

            // If clicking the currently active task, unset it
            if (currentTaskId === taskId) {
                const response = await this.messageHandler.sendMessage('setCurrentTask', { taskId: null });
                if (response && response.state) {
                    this.renderTasksList(response.state.tasks, response.state.currentTaskId);
                    this.updateCurrentTaskDisplay(response.state.currentTaskId, response.state.tasks);
                    document.body.classList.toggle('compact-mode', !!response.state.currentTaskId);
                }
                return;
            }

            // If selecting a completed task, confirm reopen
            if (task && task.isCompleted) {
                const shouldReopen = window.confirm('This task is completed. Reopen and set as current?');
                if (shouldReopen) {
                    await this.toggleTaskCompletion(taskId, false);
                } else {
                    return;
                }
            }

            const response = await this.messageHandler.sendMessage('setCurrentTask', { taskId });

            // Refresh UI with updated state
            if (response && response.state) {
                this.renderTasksList(response.state.tasks, response.state.currentTaskId);
                this.updateCurrentTaskDisplay(response.state.currentTaskId, response.state.tasks);
                // Immediate compact mode toggle
                const hasCurrent = !!response.state.currentTaskId;
                document.body.classList.toggle('compact-mode', hasCurrent);
            }
        } catch (error) {
            console.error('Failed to select task:', error);
        }
    }

    /**
     * Edit a task
     */
    async editTask(taskId) {
        try {
            const response = await this.messageHandler.sendMessage('getTasks');
            const task = response.tasks.find(t => t.id === taskId);
            if (task) {
                this.showTaskForm(task);
            }
        } catch (error) {
            console.error('Failed to load task for editing:', error);
        }
    }

    /**
     * Delete a task
     */
    async deleteTask(taskId) {
        if (!window.confirm('Are you sure you want to delete this task?')) {
            return;
        }

        try {
            const response = await this.messageHandler.sendMessage('deleteTask', { taskId });

            // Refresh UI with updated state
            if (response && response.state) {
                this.renderTasksList(response.state.tasks, response.state.currentTaskId);
                this.updateCurrentTaskDisplay(response.state.currentTaskId, response.state.tasks);
            }
        } catch (error) {
            console.error('Failed to delete task:', error);
        }
    }

    /**
     * Toggle task completion
     */
    async toggleTaskCompletion(taskId, isCompleted) {
        try {
            const response = await this.messageHandler.sendMessage('updateTask', {
                taskId,
                updates: { isCompleted }
            });

            // Refresh UI with updated state
            if (response && response.state) {
                this.renderTasksList(response.state.tasks, response.state.currentTaskId);
                this.updateCurrentTaskDisplay(response.state.currentTaskId, response.state.tasks);
            }
        } catch (error) {
            console.error('Failed to update task completion:', error);
        }
    }

    /**
     * Show task form modal
     */
    showTaskForm(task = null) {
        this.currentEditingTaskId = task ? task.id : null;
        const modal = utils.getElement(POPUP_CONSTANTS.SELECTORS.taskFormModal);
        const title = document.getElementById('taskFormTitle');
        const form = utils.getElement(POPUP_CONSTANTS.SELECTORS.taskForm);

        if (modal && title && form) {
            title.textContent = task ? 'Edit Task' : 'Add Task';

            // Populate form if editing
            if (task) {
                document.getElementById('taskTitle').value = task.title;
                document.getElementById('taskDescription').value = task.description || '';
                document.getElementById('taskEstimate').value = task.estimatedPomodoros;
            } else {
                form.reset();
                document.getElementById('taskEstimate').value = 1;
            }

            modal.classList.remove('hidden');
            document.getElementById('taskTitle').focus();
        }
    }

    /**
     * Hide task form modal
     */
    hideTaskForm() {
        console.log('Hiding task form modal');
        const modal = utils.getElement(POPUP_CONSTANTS.SELECTORS.taskFormModal);
        if (modal) {
            modal.classList.add('hidden');
            console.log('Task form modal hidden successfully');
        } else {
            console.warn('Task form modal element not found');
        }
        this.currentEditingTaskId = null;
    }

    /**
     * Handle task form submission
     */
    async handleTaskFormSubmit(formData) {
        try {
            if (this.currentEditingTaskId) {
                // Update existing task
                const response = await this.messageHandler.sendMessage('updateTask', {
                    taskId: this.currentEditingTaskId,
                    updates: {
                        title: formData.title,
                        description: formData.description,
                        estimatedPomodoros: formData.estimatedPomodoros
                    }
                });

                // Refresh UI with updated state
                if (response && response.state) {
                    this.renderTasksList(response.state.tasks, response.state.currentTaskId);
                    this.updateCurrentTaskDisplay(response.state.currentTaskId, response.state.tasks);
                }
            } else {
                // Create new task
                const response = await this.messageHandler.sendMessage('createTask', {
                    taskData: formData
                });

                // Refresh UI with updated state
                if (response && response.state) {
                    this.renderTasksList(response.state.tasks, response.state.currentTaskId);
                    this.updateCurrentTaskDisplay(response.state.currentTaskId, response.state.tasks);
                }
            }
            this.hideTaskForm();
        } catch (error) {
            console.error('Failed to save task:', error);
            alert('Failed to save task. Please try again.');
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Update current task display
     */
    updateCurrentTaskDisplay(currentTaskId, tasks) {
        const currentTaskElement = utils.getElement(POPUP_CONSTANTS.SELECTORS.currentTask);
        const currentTaskName = utils.getElement(POPUP_CONSTANTS.SELECTORS.currentTaskName);
        const currentTaskProgress = utils.getElement(POPUP_CONSTANTS.SELECTORS.currentTaskProgress);

        if (!currentTaskElement || !currentTaskName || !currentTaskProgress) {
            return;
        }

        if (!currentTaskId) {
            currentTaskElement.classList.add('hidden');
            return;
        }

        const currentTask = tasks.find(t => t.id === currentTaskId);
        if (!currentTask) {
            currentTaskElement.classList.add('hidden');
            return;
        }

        currentTaskElement.classList.remove('hidden');
        currentTaskName.textContent = currentTask.title;
        currentTaskProgress.textContent = `${currentTask.completedPomodoros}/${currentTask.estimatedPomodoros} 🍅`;
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

        // Apply user-selected or system theme
        let selectedTheme = state.settings.theme;
        if (!selectedTheme || selectedTheme === 'system') {
            selectedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        this.body.classList.add(`${selectedTheme}-theme`);

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
            const currentInCycle = ((state.currentSession - 1) % longBreakInterval) + 1;
            this.elements.cycleProgress.textContent = `Focus ${currentInCycle} of ${longBreakInterval}`;
        }
    }

    /**
     * Update statistics display
     */
    updateStatistics(state) {
        if (state.statistics) {
            if (this.elements.completedToday) {
                this.elements.completedToday.textContent = state.statistics.completedToday || 0;
            }
            if (this.elements.focusTime) {
                const focusTimeMinutes = state.statistics.focusTimeToday || 0;
                this.elements.focusTime.textContent = utils.formatFocusTime(focusTimeMinutes);
            }
        }
    }

    /**
     * Update button states and visibility
     */
    updateButtons(state) {
        console.log('updateButtons called with state:', { isRunning: state.isRunning, autoStart: state.settings.autoStart });

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
                const isResuming = state.timeLeft < fullDuration && state.timeLeft > 0;
                const buttonText = isResuming ? 'Resume' : 'Start';
                const buttonTextElement = this.elements.startBtn.querySelector('.btn-text');
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
            volume: state.settings.volume
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
        // Batch DOM write in next animation frame to avoid mid-frame layout flashes
        if (this._lastProgressOffset !== null && Math.abs(offset - this._lastProgressOffset) < 0.25) {
            // Change is too small to matter visually; skip
            return;
        }
        	if (this._rafPending) { return; }
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
        const isLongBreak = state.currentSession % state.settings.longBreakInterval === 0;
        return isLongBreak ? state.settings.longBreak * 60 : state.settings.shortBreak * 60;
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

        const currentTask = state.tasks.find(t => t.id === state.currentTaskId);
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
            theme: document.getElementById('theme'),
            pauseOnIdle: document.getElementById('pauseOnIdle'),
            playSound: document.getElementById('playSound'),
            volume: document.getElementById('volume')
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
            theme: inputs.theme?.value || 'system',
            pauseOnIdle: inputs.pauseOnIdle ? inputs.pauseOnIdle.checked : true,
            playSound: inputs.playSound ? inputs.playSound.checked : true,
            volume: parseFloat(inputs.volume?.value) || 1
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

        if (settings.volume < 0 || settings.volume > 1) {
            errors.push('Volume must be between 0 and 1');
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
            settings: utils.getElement(POPUP_CONSTANTS.SELECTORS.settingsPanel),
            tasks: utils.getElement(POPUP_CONSTANTS.SELECTORS.tasksPanel)
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
        this.taskUIManager = new TaskUIManager(this.messageHandler);

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
            const state = await this.messageHandler.sendMessage('getState');
            if (this.taskUIManager) {
                this.taskUIManager.renderTasksList(state.tasks || [], state.currentTaskId);
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
            const state = await this.messageHandler.sendMessage('getState');
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
            if (state.uiPreferences && state.uiPreferences.tasksFilter === 'active') {
                state.uiPreferences.tasksFilter = 'in-progress';
                // Persist updated preference
                chrome.runtime.sendMessage({ action: 'updateUiPreferences', updates: { tasksFilter: 'in-progress' } });
            }
        } catch (e) { console.warn('Failed migrating tasksFilter preference', e); }

        // Fast path: if only timeLeft changed (normal ticking), avoid updating unrelated UI to prevent layout thrash/flicker
        try {
            if (this._lastState) {
                const prev = this._lastState;
                const fieldsToCompare = ['isRunning','currentSession','isWorkSession','currentTaskId'];
                const structuralUnchanged = fieldsToCompare.every(k => prev[k] === state[k]);
                const settingsUnchanged = prev.settings === state.settings || (
                    prev.settings && state.settings &&
                    ['workDuration','shortBreak','longBreak','longBreakInterval','autoStart','theme','pauseOnIdle','playSound','volume']
                        .every(k => prev.settings[k] === state.settings[k])
                );
                const tasksSameRef = prev.tasks === state.tasks; // tasks array not reallocated
                if (structuralUnchanged && settingsUnchanged && tasksSameRef && prev.timeLeft !== state.timeLeft) {
                    // Only timeLeft is different -> update just timer + progress ring
                    this.uiManager.updateTimer(state);
                    this.uiManager.updateProgressRing(state);
                    this._lastState = state; // store new ref
                    return; // Skip rest
                }
            }
        } catch (e) {
            console.warn('Fast-path diff failed; falling back to full update', e);
        }

        this.uiManager.updateUI(state);
        this.themeManager.applyTheme(state);

        // Update task-related UI
        if (state.tasks && this.taskUIManager) {
            const tasksPanelEl = this.navigationManager?.panels?.tasks;
            const tasksPanelVisible = tasksPanelEl && !tasksPanelEl.classList.contains('hidden');
            const shouldSkip = state.isRunning && tasksPanelVisible; // prevent flicker while viewing tasks during active countdown
            if (!shouldSkip) {
                this.taskUIManager.renderTasksList(state.tasks, state.currentTaskId);
            }
            // Always update current task summary strip (small top display) regardless
            this.taskUIManager.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);

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
                        countEl.classList.remove('badge--accent','badge--pulse');
                    }
                }
            } catch (e) { console.warn('Failed updating tasks count badge', e); }
        }

        // Toggle compact mode (smaller timer & tighter spacing) when a current task is active
        try {
            const hasCurrent = !!(state.currentTaskId && state.tasks && state.tasks.some(t => t.id === state.currentTaskId));
            // Only toggle if changed to avoid unnecessary layout / transition churn
            if (document.body.classList.contains('compact-mode') !== hasCurrent) {
                document.body.classList.toggle('compact-mode', hasCurrent);
            }
        } catch (e) {
            console.warn('Failed to toggle compact mode', e);
        }

        // Update hideCompleted toggle button state if present
        if (state.uiPreferences) {
            if (this.taskUIManager && state.uiPreferences.tasksFilter) {
                this.taskUIManager.currentFilter = state.uiPreferences.tasksFilter;
                this.syncFilterButtons(state.uiPreferences.tasksFilter);
            }
        }

        	// Store last state for diffing
        	this._lastState = state;
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
        const tasksBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.tasksBtn);
        const backBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.backBtn);
        const backFromTasksBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.backFromTasksBtn);
        const filtersBar = document.getElementById('tasksFilters');

        if (settingsBtn) {
            settingsBtn.addEventListener('click', async () => {
                this.navigationManager.showSettingsPanel();

                // Load current settings when showing the settings panel
                try {
                    const state = await this.messageHandler.sendMessage('getState');
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
                    const state = await this.messageHandler.sendMessage('getState');
                    console.log('Refreshed state for tasks panel:', state);
                    if (state.tasks && this.taskUIManager) {
                        this.taskUIManager.renderTasksList(state.tasks, state.currentTaskId);
                    }
                } catch (error) {
                    console.error('Failed to refresh tasks:', error);
                }
            });
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.navigationManager.showTimerPanel();
            });
        }

        if (backFromTasksBtn) {
            backFromTasksBtn.addEventListener('click', () => {
                this.navigationManager.showTimerPanel();
            });
        }

        if (filtersBar) {
            filtersBar.addEventListener('click', async (e) => {
                const btn = e.target.closest('.tasks-filter');
                if (!btn) {return;}
                const selected = btn.getAttribute('data-filter');
                if (!selected) {return;}
                // If already active, ignore
                if (btn.classList.contains('is-active')) {return;}
                try {
                    const response = await this.messageHandler.sendMessage('updateUiPreferences', { uiPreferences: { tasksFilter: selected } });
                    if (response && response.state && this.taskUIManager) {
                        this.taskUIManager.currentFilter = selected;
                        this.syncFilterButtons(selected);
                        this.taskUIManager.renderTasksList(response.state.tasks, response.state.currentTaskId);
                    }
                } catch (err) {
                    console.error('Failed to set tasks filter', err);
                }
            });
        }
    }

    syncFilterButtons(activeFilter) {
        const bar = document.getElementById('tasksFilters');
        if (!bar) {return;}
        bar.querySelectorAll('.tasks-filter').forEach(btn => {
            const isActive = btn.getAttribute('data-filter') === activeFilter;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive.toString());
        });
    }

    /**
     * Setup task event listeners
     */
    setupTaskEvents() {
        const addTaskBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.addTaskBtn);
        const closeTaskFormBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.closeTaskFormBtn);
        const cancelTaskBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.cancelTaskBtn);
        const taskForm = utils.getElement(POPUP_CONSTANTS.SELECTORS.taskForm);
        const clearTaskBtn = utils.getElement(POPUP_CONSTANTS.SELECTORS.clearTaskBtn);
        const taskFormModal = utils.getElement(POPUP_CONSTANTS.SELECTORS.taskFormModal);
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
                    const response = await this.messageHandler.sendMessage('setCurrentTask', { taskId: null });

                    // Update UI immediately with the response
                    if (response && response.state) {
                        this.updateState(response.state);

                        // Also update task UI components if available
                        if (this.taskUIManager) {
                            this.taskUIManager.renderTasksList(response.state.tasks || [], response.state.currentTaskId);
                            this.taskUIManager.updateCurrentTaskDisplay(response.state.currentTaskId, response.state.tasks || []);
                        }
                        document.body.classList.remove('compact-mode');
                    }
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
                    description: document.getElementById('taskDescription').value.trim(),
                    estimatedPomodoros: parseInt(document.getElementById('taskEstimate').value) || 1
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
                if (!window.confirm('Remove all completed tasks? This cannot be undone.')) { return; }
                try {
                    const response = await this.messageHandler.sendMessage('clearCompletedTasks');
                    if (response && response.state) {
                        this.updateState(response.state);
                    }
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
                        await this.messageHandler.sendMessage('clearStatistics');
                        alert('All statistics data has been cleared successfully.');

                        // Refresh the UI to show updated statistics
                        const state = await this.messageHandler.sendMessage('getState');
                        this.updateState(state);
                    } catch (error) {
                        console.error('Failed to clear statistics data:', error);
                        alert('Failed to clear statistics data. Please try again.');
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
        if (event.code === 'Space' && !event.target.matches('input, textarea')) {
            event.preventDefault();
            this.uiManager.elements.startBtn?.click() || this.uiManager.elements.pauseBtn?.click();
        }

        // Escape to go back to timer panel
        if (event.code === 'Escape') {
            // Close modal first if open
            const modal = utils.getElement(POPUP_CONSTANTS.SELECTORS.taskFormModal);
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
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - initializing popup');
    try {
        new PopupController();
    } catch (error) {
        console.error('Failed to create PopupController:', error);
    }
});
