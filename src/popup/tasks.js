import { POPUP_CONSTANTS, utils } from './common.js';
import { notifyError, notifySuccess } from './notifications.js';

export class TaskUIManager {
    constructor(messageHandler) {
        this.messageHandler = messageHandler;
        this.currentEditingTaskId = null;
        this.currentFilter = 'all';
        this.setupJiraSyncButton();
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
        // (Selection now restricted to explicit menu action; card surface no longer selects the task.)

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
                const state = await this.messageHandler.sendMessage('setCurrentTask', { taskId: null });
                this.renderTasksList(state.tasks, state.currentTaskId);
                this.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);
                const hasCurrent = !!state.currentTaskId;
                document.body.classList.toggle('compact-mode', hasCurrent);
                document.body.classList.toggle('has-current-task', hasCurrent);
                (window.requestAnimationFrame || window.setTimeout)(() => {
                    window._popupController?.syncCurrentTaskLayout?.();
                });
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

            const state = await this.messageHandler.sendMessage('setCurrentTask', { taskId });

            // Refresh UI with updated state
            this.renderTasksList(state.tasks, state.currentTaskId);
            this.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);
            // Immediate compact mode toggle
            const hasCurrent = !!state.currentTaskId;
            document.body.classList.toggle('compact-mode', hasCurrent);
            document.body.classList.toggle('has-current-task', hasCurrent);
            (window.requestAnimationFrame || window.setTimeout)(() => {
                window._popupController?.syncCurrentTaskLayout?.();
            });
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
            const state = await this.messageHandler.sendMessage('deleteTask', { taskId });

            // Refresh UI with updated state
            this.renderTasksList(state.tasks, state.currentTaskId);
            this.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);
        } catch (error) {
            console.error('Failed to delete task:', error);
        }
    }

    /**
     * Toggle task completion
     */
    async toggleTaskCompletion(taskId, isCompleted) {
        try {
            const state = await this.messageHandler.sendMessage('updateTask', {
                taskId,
                updates: { isCompleted }
            });

            // Refresh UI with updated state
            this.renderTasksList(state.tasks, state.currentTaskId);
            this.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);
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
                const state = await this.messageHandler.sendMessage('updateTask', {
                    taskId: this.currentEditingTaskId,
                    updates: {
                        title: formData.title,
                        description: formData.description,
                        estimatedPomodoros: formData.estimatedPomodoros
                    }
                });

                // Refresh UI with updated state
                this.renderTasksList(state.tasks, state.currentTaskId);
                this.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);
            } else {
                // Create new task
                const state = await this.messageHandler.sendMessage('createTask', {
                    task: formData
                });

                // Refresh UI with updated state
                this.renderTasksList(state.tasks, state.currentTaskId);
                this.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);
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

TaskUIManager.prototype.setupJiraSyncButton = function() {
    const btn = utils.getElement(POPUP_CONSTANTS.SELECTORS.syncJiraBtn);
    if (!btn) { return; }
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
            const state = await this.messageHandler.sendMessage('importJiraTasks');
            this.renderTasksList(state.tasks || [], state.currentTaskId);
            notifySuccess('Jira tasks synced successfully.');
        } catch (err) {
            console.error('Failed to import Jira tasks:', err);
            notifyError(`Jira sync failed: ${err?.message || 'Unknown error'}`);
        } finally {
            btn.disabled = false;
        }
    });
};

/**
 * Handles communication with the background script
 */
