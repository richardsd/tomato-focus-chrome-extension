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
    this.hideCompletedPreference = false;
    this.filter = 'all';
    this.searchQuery = '';
    this.sort = 'created';
    this.selectMode = false;
    this.selectedIds = new Set();
    this.dragSrcEl = null;
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

    // Apply hideCompleted preference if available on window state snapshot
        // Build pipeline
        let displayTasks = [...(tasks || [])];
        const hideCompleted = this.hideCompletedPreference === true;
        if (hideCompleted && this.filter === 'all') {
            displayTasks = displayTasks.filter(t => !t.isCompleted);
        }
        switch (this.filter) {
        case 'active': displayTasks = displayTasks.filter(t => !t.isCompleted); break;
        case 'completed': displayTasks = displayTasks.filter(t => t.isCompleted); break;
        case 'current': displayTasks = displayTasks.filter(t => t.id === currentTaskId); break;
        }
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            displayTasks = displayTasks.filter(t => (t.title && t.title.toLowerCase().includes(q)) || (t.description && t.description.toLowerCase().includes(q)));
        }
        // Sort
        if (this.sort === 'remaining') {
            displayTasks.sort((a,b)=> (a.estimatedPomodoros - a.completedPomodoros) - (b.estimatedPomodoros - b.completedPomodoros));
        } else if (this.sort === 'status') {
            const order = { pending:0, 'in-progress':1, completed:2 };
            displayTasks.sort((a,b)=> (order[this.getStatusKey(a)] - order[this.getStatusKey(b)]));
        } else { // created
            displayTasks.sort((a,b)=> (a.order ?? 0) - (b.order ?? 0));
        }

    console.log('Tasks list element found, rendering...', { hideCompleted });

    if (!displayTasks || displayTasks.length === 0) {
            const anyTasks = (tasks && tasks.length) > 0;
            let text = 'No tasks yet';
            let sub = 'Add a task to start tracking your focus sessions';
            if (anyTasks) {
                if (this.searchQuery) { text = 'No tasks match search'; sub = 'Try different keywords'; }
                else if (this.filter === 'active') { text = 'No active tasks'; sub = 'Completed tasks are hidden'; }
                else if (this.filter === 'completed') { text = 'No completed tasks yet'; sub = 'Focus and complete tasks to see them here'; }
                else if (this.filter === 'current') { text = 'No current task selected'; sub = 'Pick a task to focus on'; }
                else { text = 'No tasks match filters'; sub = 'Adjust filters to see tasks'; }
            }
            tasksList.innerHTML = `
                <div class="tasks-empty tasks-empty--context">
                    <div class="tasks-empty__icon">📋</div>
                    <div class="tasks-empty__text">${text}</div>
                    <div class="tasks-empty__subtext">${sub}</div>
                </div>`;
            return;
        }

    console.log('Rendering', displayTasks.length, 'tasks (filtered)');
    const tasksHTML = displayTasks.map(task => this.renderTaskItem(task, currentTaskId)).join('');
        console.log('Generated HTML:', tasksHTML);
        tasksList.innerHTML = tasksHTML;
        console.log('TasksList innerHTML after setting:', tasksList.innerHTML);

        // Add event listeners for task items
        this.attachTaskEventListeners();
    this.updateBulkUI(tasks);
    this.enableDragAndDrop();
    }

    /**
     * Render a single task item
     */
    getStatusKey(task) {return task.isCompleted ? 'completed' : (task.completedPomodoros > 0 ? 'in-progress' : 'pending');}

    renderTaskItem(task, currentTaskId) {
        const isCurrentTask = task.id === currentTaskId;
        const progress = `${task.completedPomodoros}/${task.estimatedPomodoros}`;
        const statusClass = this.getStatusKey(task);
        const statusText = task.isCompleted ? 'Completed' : (task.completedPomodoros > 0 ? 'In progress' : 'Pending');
        const rawTitle = (task.title || '').toString();
        const truncatedTitle = rawTitle.length > 50 ? rawTitle.slice(0,47) + '...' : rawTitle;
        const toggleLabel = task.isCompleted ? 'Reopen task' : 'Mark task completed';
        const toggleTitle = task.isCompleted ? 'Reopen task' : 'Mark complete';
        return `
            <div class="task-item ${isCurrentTask ? 'task-item--current' : ''} ${task.isCompleted ? 'task-item--completed' : ''} ${this.selectMode ? 'select-mode' : ''}"
                 data-task-id="${task.id}" draggable="${!this.selectMode}" aria-label="Task: ${this.escapeHtml(task.title)}. ${statusText}. Progress ${progress} pomodoros." tabindex="0">
                <div class="task-item__drag-handle" title="Drag to reorder" aria-hidden="true"><span></span><span></span><span></span></div>
                ${this.selectMode ? `<button class="task-item__select-box ${this.selectedIds.has(task.id) ? 'selected':''}" data-select-id="${task.id}" aria-pressed="${this.selectedIds.has(task.id)}" aria-label="Select task"></button>` : ''}
                <div class="task-item__header">
                    <div class="task-item__title ${task.isCompleted ? 'completed' : ''}" title="${this.escapeHtml(task.title)}">
                        ${this.escapeHtml(truncatedTitle)}
                    </div>
                    <div class="task-item__actions" role="group" aria-label="Task actions">
                        <button class="task-item__action task-select" data-task-id="${task.id}" aria-label="${task.isCompleted ? 'Reopen and set current task' : (isCurrentTask ? 'Current task' : 'Set current task')}" title="${task.isCompleted ? 'Reopen & focus' : (isCurrentTask ? 'Current task' : 'Set current task')}"><svg width="16" height="16"><use href="#icon-target"/></svg></button>
                        <button class="task-item__action task-toggle" data-task-id="${task.id}" aria-pressed="${task.isCompleted}" aria-label="${toggleLabel}" title="${toggleTitle}"><svg width="16" height="16"><use href="#${task.isCompleted ? 'icon-reopen' : 'icon-check'}"/></svg></button>
                        <button class="task-item__action task-edit" data-task-id="${task.id}" aria-label="Edit task" title="Edit task"><svg width="16" height="16"><use href="#icon-edit"/></svg></button>
                        <button class="task-item__action task-delete" data-task-id="${task.id}" aria-label="Delete task" title="Delete task"><svg width="16" height="16"><use href="#icon-trash"/></svg></button>
                    </div>
                </div>
                ${task.description ? `<div class="task-item__description" title="${this.escapeHtml(task.description)}">${this.escapeHtml(task.description)}</div>` : ''}
                <div class="task-item__progress-chip" role="status" aria-label="${statusText}; Progress ${progress} pomodoros">
                    <span class="task-item__pomodoros" aria-hidden="true"><svg width="14" height="14"><use href="#icon-tomato"/></svg> ${progress}</span>
                    <span class="task-item__status ${statusClass}">${statusText}</span>
                </div>
            </div>
        `;
    }    /**
     * Attach event listeners to task items
     */
    attachTaskEventListeners() {
        // Selection boxes
        document.querySelectorAll('.task-item__select-box').forEach(box => {
            box.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = box.getAttribute('data-select-id');
                if (this.selectedIds.has(id)) { this.selectedIds.delete(id); } else { this.selectedIds.add(id); }
                box.classList.toggle('selected');
                this.updateBulkUI();
            });
        });
        // Select task buttons
        document.querySelectorAll('.task-select').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.selectTask(taskId);
            });
        });

        // Single toggle button
        document.querySelectorAll('.task-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                const current = btn.getAttribute('aria-pressed') === 'true';
                this.toggleTaskCompletion(taskId, !current);
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
                if (this.selectMode) { return; }
                const taskId = item.dataset.taskId;
                this.selectTask(taskId);
            });
        });

        // Keyboard shortcuts on task item (Enter toggles completion, C selects, Delete deletes)
        document.querySelectorAll('.task-item').forEach(item => {
            item.addEventListener('keydown', (e) => {
                if (this.selectMode) return;
                const taskId = item.dataset.taskId;
                if (!taskId) return;
                switch(e.key) {
                    case 'Enter':
                        e.preventDefault();
                        this.toggleTaskCompletion(taskId, !item.classList.contains('task-item--completed'));
                        break;
                    case 'c':
                    case 'C':
                        e.preventDefault();
                        this.selectTask(taskId);
                        break;
                    case 'Delete':
                        e.preventDefault();
                        this.deleteTask(taskId);
                        break;
                }
            });
        });
    }

    /**
     * Select a task as current
     */
    async selectTask(taskId) {
        try {
            // Check if the task is completed and warn user
            const tasksResponse = await this.messageHandler.sendMessage('getTasks');
            const task = tasksResponse.tasks.find(t => t.id === taskId);

            if (task && task.isCompleted) {
                const shouldReopen = window.confirm('This task is completed. Do you want to reopen it and set it as current?');
                if (shouldReopen) {
                    // Reopen the task first
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
                // Flash animation to indicate change
                const el = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
                if (el) {
                    el.classList.remove('flash-update','flash-reopen');
                    void el.offsetWidth; // restart animation
                    el.classList.add(isCompleted ? 'flash-update' : 'flash-reopen');
                }
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
    /* Bulk UI update (simplified – multi-select UI deprecated) */
    updateBulkUI(allTasks = null) {
        const bulkBar = document.getElementById('bulkActions');
        const clearCompletedWrapper = document.getElementById('clearCompletedWrapper');
        const hasCompleted = (allTasks || []).some(t => t.isCompleted);
        if (clearCompletedWrapper) {
            if (hasCompleted) { clearCompletedWrapper.classList.remove('hidden'); } else { clearCompletedWrapper.classList.add('hidden'); }
        }
        if (bulkBar) { bulkBar.classList.add('hidden'); }
    }

    /* Drag & drop enable (moved from MessageHandler) */
    enableDragAndDrop() {
        if (this.selectMode) { return; }
        const list = document.getElementById('tasksList');
        if (!list) { return; }
    const items = list.querySelectorAll('.task-item');
    let placeholderIndex = null;
        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                this.dragSrcEl = item;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                list.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
                list.querySelectorAll('.drag-placeholder').forEach(el=>el.classList.remove('drag-placeholder'));
                placeholderIndex = null;
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (item === this.dragSrcEl) return;
                item.classList.add('drag-over');
                const all = Array.from(list.querySelectorAll('.task-item'));
                const overIndex = all.indexOf(item);
                if (placeholderIndex !== overIndex) {
                    list.querySelectorAll('.drag-placeholder').forEach(el=>el.classList.remove('drag-placeholder'));
                    item.classList.add('drag-placeholder');
                    placeholderIndex = overIndex;
                }
            });
            item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
            item.addEventListener('drop', async (e) => {
                e.preventDefault();
                if (item === this.dragSrcEl) return;
                const listEl = item.parentNode;
                const nodes = Array.from(listEl.querySelectorAll('.task-item'));
                const srcIndex = nodes.indexOf(this.dragSrcEl);
                const destIndex = nodes.indexOf(item);
                if (srcIndex < destIndex) {
                    listEl.insertBefore(this.dragSrcEl, item.nextSibling);
                } else {
                    listEl.insertBefore(this.dragSrcEl, item);
                }
                listEl.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
                listEl.querySelectorAll('.drag-placeholder').forEach(el=>el.classList.remove('drag-placeholder'));
                placeholderIndex = null;
                // Persist new order
                const orderedIds = Array.from(listEl.querySelectorAll('.task-item')).map(i=>i.getAttribute('data-task-id'));
                try { await this.messageHandler.sendMessage('reorderTasks', { orderedIds }); } catch(err){ console.error('reorder failed', err); }
            });
        });
    }

    announce(message) {
        const ann = document.getElementById('tasksAnnouncer');
        if (ann) { ann.textContent = message; }
    }
};

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

        this.uiManager.updateUI(state);
        this.themeManager.applyTheme(state);

        // Update task-related UI
        if (state.tasks && this.taskUIManager) {
            this.taskUIManager.renderTasksList(state.tasks, state.currentTaskId);
            this.taskUIManager.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);
        }

        // Sync UI preferences (hideCompleted & selectMode deprecated visually but retained if stored)
        if (state.uiPreferences && this.taskUIManager) {
            this.taskUIManager.hideCompletedPreference = !!state.uiPreferences.hideCompleted;
            this.taskUIManager.filter = state.uiPreferences.filter || 'all';
            this.taskUIManager.searchQuery = state.uiPreferences.searchQuery || '';
            this.taskUIManager.sort = state.uiPreferences.sort || 'created';
            this.taskUIManager.selectMode = false; // force off with new compact UI
        }

        // Sync toolbar states
        const filterButtons = document.querySelectorAll('.pill');
        filterButtons.forEach(btn => {
            const isActive = btn.getAttribute('data-filter') === this.taskUIManager.filter;
            btn.classList.toggle('pill--active', isActive);
            btn.setAttribute('aria-pressed', isActive.toString());
        });
        const searchInput = document.getElementById('taskSearch');
        if (searchInput && searchInput.value !== this.taskUIManager.searchQuery) { searchInput.value = this.taskUIManager.searchQuery; }
    const sortSelect = document.getElementById('taskSort');
    if (sortSelect && sortSelect.value !== this.taskUIManager.sort) { sortSelect.value = this.taskUIManager.sort; }
    // Removed toggles (hide completed & select mode) - no state sync required
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
    // Deprecated controls removed from UI: hideCompletedToggle, selectModeToggle
    const filterButtons = document.querySelectorAll('.pill');
    const searchInput = document.getElementById('taskSearch');
    const sortSelect = document.getElementById('taskSort');
    const quickAddForm = document.getElementById('quickAddForm');
    const quickAddInput = document.getElementById('quickAddInput');
    const bulkCompleteBtn = document.getElementById('bulkCompleteBtn');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const bulkCancelBtn = document.getElementById('bulkCancelBtn');
    const clearCompletedBtn = document.getElementById('clearCompletedBtn');

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

    // hideCompleted toggle removed

        // Filter buttons
        filterButtons.forEach(btn => {
            btn.addEventListener('click', async ()=> {
                const filter = btn.getAttribute('data-filter');
                try {
                    const response = await this.messageHandler.sendMessage('updateUiPreferences', { uiPreferences: { filter } });
                    if (response && response.state && this.taskUIManager) {
                        this.taskUIManager.filter = filter;
                        this.updateState(response.state);
                    }
                } catch(err){ console.error('filter update failed', err); }
            });
        });

        // Search debounce
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', ()=> {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(async ()=> {
                    const query = searchInput.value.trim();
                    try {
                        const response = await this.messageHandler.sendMessage('updateUiPreferences', { uiPreferences: { searchQuery: query } });
                        if (response && response.state && this.taskUIManager) {
                            this.taskUIManager.searchQuery = query;
                            this.taskUIManager.renderTasksList(response.state.tasks, response.state.currentTaskId);
                        }
                    } catch(err){ console.error('search update failed', err); }
                }, 150);
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', async () => {
                const sort = sortSelect.value;
                try {
                    const response = await this.messageHandler.sendMessage('updateUiPreferences', { uiPreferences: { sort } });
                    if (response && response.state && this.taskUIManager) {
                        this.taskUIManager.sort = sort;
                        this.taskUIManager.renderTasksList(response.state.tasks, response.state.currentTaskId);
                    }
                } catch(err){ console.error('sort update failed', err); }
            });
        }

        if (quickAddForm && quickAddInput) {
            quickAddForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = quickAddInput.value.trim();
                if (!title) return;
                try {
                    const response = await this.messageHandler.sendMessage('createTask', { taskData: { title, estimatedPomodoros: 1 } });
                    if (response && response.state) {
                        quickAddInput.value = '';
                        this.updateState(response.state);
                    }
                } catch(err){ console.error('quick add failed', err); }
            });
        }

    // select mode toggle removed

        if (bulkCompleteBtn) {
            bulkCompleteBtn.addEventListener('click', async ()=> {
                const ids = Array.from(this.taskUIManager.selectedIds);
                if (!ids.length) return;
                try {
                    const response = await this.messageHandler.sendMessage('bulkCompleteTasks', { ids });
                    if (response && response.state) { this.updateState(response.state); }
                } catch(err){ console.error('bulk complete failed', err); }
            });
        }
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', async ()=> {
                const ids = Array.from(this.taskUIManager.selectedIds);
                if (!ids.length) return;
                if (!window.confirm(`Delete ${ids.length} tasks? This cannot be undone.`)) return;
                try {
                    const response = await this.messageHandler.sendMessage('bulkDeleteTasks', { ids });
                    if (response && response.state) { this.updateState(response.state); }
                } catch(err){ console.error('bulk delete failed', err); }
            });
        }
        if (bulkCancelBtn) {
            bulkCancelBtn.addEventListener('click', async ()=> {
                try {
                    const response = await this.messageHandler.sendMessage('updateUiPreferences', { uiPreferences: { selectMode: false, selectedIds: [] } });
                    if (response && response.state) { this.updateState(response.state); }
                } catch(err){ console.error('bulk cancel failed', err); }
            });
        }
        if (clearCompletedBtn) {
            clearCompletedBtn.addEventListener('click', async ()=> {
                if (!window.confirm('Clear all completed tasks?')) return;
                try {
                    const response = await this.messageHandler.sendMessage('clearCompletedTasks');
                    if (response && response.state) { this.updateState(response.state); }
                } catch(err){ console.error('clear completed failed', err); }
            });
        }
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
