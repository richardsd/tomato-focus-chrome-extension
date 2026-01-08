import { POPUP_CONSTANTS, utils } from './common.js';
import { notifyError, notifySuccess } from './notifications.js';
import { requestJiraPermission } from '../shared/jiraPermissions.js';

export class TaskUIManager {
    constructor(messageHandler) {
        this.messageHandler = messageHandler;
        this.currentEditingTaskId = null;
        this.currentFilter = 'all';
        this.selectedTaskIds = [];
        this.currentDisplayTaskIds = [];
        this.tasksHeaderEl = null;
        this.selectionBar = null;
        this.selectionCountEl = null;
        this.selectionCancelBtn = null;
        this.deleteSelectedButtons = [];
        this.completeSelectedButtons = [];
        this.selectAllButtons = [];
        this.setupJiraSyncButton();
        this.setupSelectionBar();
    }

    /**
     * Render the tasks list
     */
    renderTasksList(tasks, currentTaskId) {
        const allTasks = Array.isArray(tasks) ? tasks : [];
        console.log('renderTasksList called with:', {
            tasks: allTasks,
            currentTaskId,
        });
        const tasksList = utils.getElement(POPUP_CONSTANTS.SELECTORS.tasksList);
        if (!tasksList) {
            console.warn('tasksList element not found');
            return;
        }
        // Apply filter
        let displayTasks = allTasks;
        if (this.currentFilter === 'in-progress') {
            displayTasks = allTasks.filter((t) => !t.isCompleted);
        } else if (this.currentFilter === 'completed') {
            displayTasks = allTasks.filter((t) => t.isCompleted);
        }

        this.currentDisplayTaskIds = displayTasks.map((task) =>
            String(task.id)
        );
        this.selectedTaskIds = this.selectedTaskIds.filter((id) =>
            this.currentDisplayTaskIds.includes(id)
        );

        console.log(
            'Tasks list element found, rendering with filter:',
            this.currentFilter
        );

        if (!displayTasks || displayTasks.length === 0) {
            console.log('No tasks found, showing empty state');
            tasksList.innerHTML = `
                <div class="tasks-empty">
                    <div class="tasks-empty__icon">📋</div>
                    <div class="tasks-empty__text">No tasks yet</div>
                    <div class="tasks-empty__subtext">Add a task to start tracking your focus sessions</div>
                </div>
            `;
            this.updateSelectionBar();
            return;
        }

        console.log('Rendering', displayTasks.length, 'tasks (filtered)');
        const tasksHTML = displayTasks
            .map((task) => this.renderTaskItem(task, currentTaskId))
            .join('');
        console.log('Generated HTML:', tasksHTML);
        tasksList.innerHTML = tasksHTML;
        console.log('TasksList innerHTML after setting:', tasksList.innerHTML);

        // Add event listeners for task items
        this.attachTaskEventListeners();

        this.syncTaskSelectionCheckboxes();

        // Toggle visibility of clear completed button
        const clearCompletedBtn = document.getElementById('clearCompletedBtn');
        if (clearCompletedBtn) {
            const shouldShowClearCompleted =
                this.currentFilter === 'completed' && displayTasks.length > 0;
            clearCompletedBtn.classList.toggle(
                'hidden',
                !shouldShowClearCompleted
            );
            clearCompletedBtn.disabled = !shouldShowClearCompleted;
        }
        this.updateSelectionBar();
    }

    /**
     * Render a single task item
     */
    renderTaskItem(task, currentTaskId) {
        const isCurrentTask = task.id === currentTaskId;
        const progress = `${task.completedPomodoros}/${task.estimatedPomodoros}`;
        const statusClass = task.isCompleted
            ? 'completed'
            : task.completedPomodoros > 0
              ? 'in-progress'
              : 'pending';
        const statusText = task.isCompleted
            ? 'Completed'
            : task.completedPomodoros > 0
              ? 'In progress'
              : 'Pending';
        const isSelected = this.selectedTaskIds.includes(task.id);
        const itemClasses = ['task-item'];
        if (isCurrentTask) {
            itemClasses.push('task-item--current');
        }
        if (task.isCompleted) {
            itemClasses.push('task-item--completed');
        }
        if (isSelected) {
            itemClasses.push('task-item--selected');
        }

        // Truncate title if it's too long (max 50 characters)
        const truncatedTitle =
            task.title.length > 50
                ? task.title.substring(0, 47) + '...'
                : task.title;

        return `
            <div class="${itemClasses.join(' ')}"
                 data-task-id="${task.id}" aria-label="Task: ${this.escapeHtml(task.title)}. ${statusText}. Progress ${progress} pomodoros." tabindex="0">
                <div class="task-item__header">
                    <div class="task-item__selection">
                        <input type="checkbox" class="task-item__checkbox" data-task-id="${task.id}" ${isSelected ? 'checked' : ''} aria-label="Select task ${this.escapeHtml(task.title)}">
                    </div>
                    <div class="task-item__title ${task.isCompleted ? 'completed' : ''}" title="${this.escapeHtml(task.title)}">
                        ${this.escapeHtml(truncatedTitle)}
                    </div>
                    <div class="task-item__menu" data-task-id="${task.id}">
                        <button class="task-item__menu-trigger" aria-haspopup="true" aria-expanded="false" aria-label="Task actions menu" title="Actions">⋮</button>
                        <div class="task-item__menu-dropdown" role="menu" aria-label="Task actions">
                            <button class="task-item__action task-select" role="menuitem" data-task-id="${task.id}" aria-pressed="${isCurrentTask}">🎯 ${task.isCompleted ? 'Reopen & Select' : isCurrentTask ? 'Unset Current' : 'Set Current'}</button>
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
    }

    /**
     * Attach event listeners to task items
     */
    attachTaskEventListeners() {
        document
            .querySelectorAll('.task-item__checkbox')
            .forEach((checkbox) => {
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const taskId = checkbox.dataset.taskId;
                    this.toggleTaskSelection(taskId, checkbox.checked);
                });
                checkbox.addEventListener('click', (e) => e.stopPropagation());
            });

        // Select task buttons
        document.querySelectorAll('.task-select').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.selectTask(taskId);
            });
        });

        // Complete task buttons
        document.querySelectorAll('.task-complete').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.toggleTaskCompletion(taskId, true);
            });
        });

        // Reopen task buttons
        document.querySelectorAll('.task-reopen').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.toggleTaskCompletion(taskId, false);
            });
        });

        // Edit task buttons
        document.querySelectorAll('.task-edit').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.editTask(taskId);
            });
        });

        // Delete task buttons
        document.querySelectorAll('.task-delete').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                this.deleteTask(taskId);
            });
        });

        // Task item click to select
        // (Selection now restricted to explicit menu action; card surface no longer selects the task.)

        // Complete task on double-click
        document
            .querySelectorAll('.task-item:not(.task-item--completed)')
            .forEach((item) => {
                item.addEventListener('dblclick', () => {
                    const taskId = item.dataset.taskId;
                    this.toggleTaskCompletion(taskId, true);
                });
            });

        // Setup expandable descriptions & menus after tasks render
        this.setupDescriptionToggles();
        this.setupMenus();
    }

    setupSelectionBar() {
        this.tasksHeaderEl = document.getElementById('tasksHeaderBar');
        this.selectionBar = document.getElementById('tasksSelectionBar');
        this.selectionCountEl = document.getElementById('tasksSelectionCount');
        this.selectionCancelBtn = document.getElementById('cancelSelectionBtn');
        const selectionBarRoot = document.getElementById('tasksSelectionBar');
        this.deleteSelectedButtons = selectionBarRoot
            ? Array.from(
                  selectionBarRoot.querySelectorAll(
                      '[data-action="delete-selected"]'
                  )
              )
            : [];
        this.completeSelectedButtons = selectionBarRoot
            ? Array.from(
                  selectionBarRoot.querySelectorAll(
                      '[data-action="complete-selected"]'
                  )
              )
            : [];
        this.selectAllButtons = Array.from(
            document.querySelectorAll('[data-action="select-all"]')
        );
        if (this.selectionCancelBtn) {
            this.selectionCancelBtn.addEventListener('click', () => {
                this.clearSelection();
            });
        }

        this.deleteSelectedButtons.forEach((button) => {
            button.disabled = true;
            button.addEventListener('click', async () => {
                await this.deleteSelectedTasks();
            });
        });

        this.completeSelectedButtons.forEach((button) => {
            button.disabled = true;
            button.addEventListener('click', async () => {
                await this.completeSelectedTasks();
            });
        });

        this.selectAllButtons.forEach((button) => {
            button.disabled = true;
            button.addEventListener('click', () => {
                // Behaves like toggle: if all selected -> clear, else select remaining
                this.selectAllDisplayedTasks();
            });
            button.addEventListener('keydown', (event) => {
                const { key } = event;
                if (key === ' ' || key === 'Enter') {
                    event.preventDefault();
                    button.click();
                }
            });
        });

        this.updateSelectionBar();
    }

    toggleTaskSelection(taskId, explicitState = null) {
        if (!taskId) {
            return;
        }
        const id = String(taskId);
        const currentlySelected = this.selectedTaskIds.includes(id);
        let shouldSelect = explicitState;
        if (shouldSelect === null) {
            shouldSelect = !currentlySelected;
        }

        if (shouldSelect && !currentlySelected) {
            this.selectedTaskIds.push(id);
        } else if (!shouldSelect && currentlySelected) {
            this.selectedTaskIds = this.selectedTaskIds.filter(
                (existingId) => existingId !== id
            );
        }

        this.updateTaskSelectionUI(id, shouldSelect);
        this.updateSelectionBar();
    }

    updateTaskSelectionUI(taskId, isSelected) {
        const taskElement = Array.from(
            document.querySelectorAll('.task-item')
        ).find((item) => item.dataset.taskId === taskId);
        if (!taskElement) {
            return;
        }
        taskElement.classList.toggle('task-item--selected', !!isSelected);
        const checkbox = taskElement.querySelector('.task-item__checkbox');
        if (checkbox) {
            checkbox.checked = !!isSelected;
        }
    }

    updateSelectionBar() {
        const count = this.selectedTaskIds.length;
        const inSelectionMode = count > 0;

        if (this.tasksHeaderEl) {
            this.tasksHeaderEl.classList.toggle('hidden', inSelectionMode);
        }

        if (this.selectionBar) {
            this.selectionBar.classList.toggle('hidden', !inSelectionMode);
        }

        if (this.selectionCountEl) {
            const label = count === 1 ? '1 Selected' : `${count} Selected`;
            this.selectionCountEl.textContent = label;
        }

        this.deleteSelectedButtons.forEach((button) => {
            button.disabled = count === 0;
        });

        this.completeSelectedButtons.forEach((button) => {
            button.disabled = count === 0;
        });

        const displayIds = Array.isArray(this.currentDisplayTaskIds)
            ? this.currentDisplayTaskIds
            : [];
        const selectedIdsSet = new Set(
            this.selectedTaskIds.map((id) => String(id))
        );
        const allSelected =
            displayIds.length > 0 &&
            displayIds.every((id) => selectedIdsSet.has(String(id)));
        const someSelected =
            !allSelected &&
            displayIds.some((id) => selectedIdsSet.has(String(id)));
        this.selectAllButtons.forEach((button) => {
            const hasTasks = displayIds.length > 0;
            let ariaChecked = 'false';
            let ariaLabel = 'Select all tasks';
            let iconChar = '⬜';
            if (allSelected) {
                ariaChecked = 'true';
                ariaLabel = 'Clear selection';
                iconChar = '✔';
            } else if (someSelected) {
                ariaChecked = 'mixed';
                ariaLabel = 'Select remaining tasks';
                iconChar = '➖';
            }
            button.disabled = !hasTasks;
            button.setAttribute('aria-checked', ariaChecked);
            button.setAttribute('aria-label', ariaLabel);
            button.title = ariaLabel;
            const srLabel = button.querySelector('[data-select-all-label]');
            if (srLabel) {
                srLabel.textContent = ariaLabel;
            }
            const icon = button.querySelector('[data-select-all-icon]');
            if (icon) {
                icon.textContent = iconChar;
            }
        });
    }

    syncTaskSelectionCheckboxes() {
        const selectedIds = new Set(this.selectedTaskIds);
        document.querySelectorAll('.task-item').forEach((item) => {
            const taskId = item.dataset.taskId;
            const isSelected = selectedIds.has(taskId);
            item.classList.toggle('task-item--selected', isSelected);
            const checkbox = item.querySelector('.task-item__checkbox');
            if (checkbox) {
                checkbox.checked = isSelected;
            }
        });
    }

    clearSelection() {
        if (!this.selectedTaskIds.length) {
            this.updateSelectionBar();
            this.syncTaskSelectionCheckboxes();
            return;
        }

        this.selectedTaskIds = [];
        this.syncTaskSelectionCheckboxes();
        this.updateSelectionBar();
    }

    selectAllDisplayedTasks() {
        const displayIds = Array.isArray(this.currentDisplayTaskIds)
            ? this.currentDisplayTaskIds
            : [];
        if (!displayIds.length) {
            return;
        }

        const normalizedDisplayIds = displayIds.map((id) => String(id));
        const displaySet = new Set(normalizedDisplayIds);
        const selectedSet = new Set(
            this.selectedTaskIds.map((id) => String(id))
        );
        const allSelected = normalizedDisplayIds.every((id) =>
            selectedSet.has(id)
        );

        if (allSelected) {
            this.selectedTaskIds = this.selectedTaskIds.filter(
                (id) => !displaySet.has(String(id))
            );
        } else {
            const combined = new Set(
                this.selectedTaskIds.map((id) => String(id))
            );
            normalizedDisplayIds.forEach((id) => combined.add(id));
            this.selectedTaskIds = Array.from(combined);
        }
        this.syncTaskSelectionCheckboxes();
        this.updateSelectionBar();
    }

    async deleteSelectedTasks() {
        if (!this.selectedTaskIds.length) {
            return;
        }

        const count = this.selectedTaskIds.length;
        const confirmationMessage =
            count === 1
                ? 'Are you sure you want to delete the selected task?'
                : `Are you sure you want to delete the ${count} selected tasks?`;

        if (!window.confirm(confirmationMessage)) {
            return;
        }

        this.deleteSelectedButtons.forEach((button) => {
            button.disabled = true;
        });
        this.completeSelectedButtons.forEach((button) => {
            button.disabled = true;
        });
        this.selectAllButtons.forEach((button) => {
            button.disabled = true;
        });

        const taskIds = [...this.selectedTaskIds];

        let state = null;

        try {
            state = await this.performBulkDeleteRequest(taskIds);
        } catch (error) {
            console.error('Failed to delete selected tasks:', error);
            alert('Failed to delete selected tasks. Please try again.');
            this.updateSelectionBar();
            return;
        }

        this.selectedTaskIds = [];

        if (!state || !Array.isArray(state.tasks)) {
            try {
                state = await this.messageHandler.sendMessage('getState');
            } catch (stateError) {
                console.error(
                    'Failed to refresh state after deletion:',
                    stateError
                );
            }
        }

        if (state && Array.isArray(state.tasks)) {
            this.renderTasksList(state.tasks, state.currentTaskId);
            this.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);
        }

        this.updateSelectionBar();
    }

    async completeSelectedTasks() {
        if (!this.selectedTaskIds.length) {
            return;
        }

        this.completeSelectedButtons.forEach((button) => {
            button.disabled = true;
        });
        this.deleteSelectedButtons.forEach((button) => {
            button.disabled = true;
        });
        this.selectAllButtons.forEach((button) => {
            button.disabled = true;
        });

        const taskIds = [...this.selectedTaskIds];

        let state = null;

        try {
            state = await this.performBulkCompleteRequest(taskIds);
        } catch (error) {
            console.error('Failed to complete selected tasks:', error);
            alert('Failed to complete selected tasks. Please try again.');
            this.updateSelectionBar();
            return;
        }

        this.selectedTaskIds = [];

        if (!state || !Array.isArray(state.tasks)) {
            try {
                state = await this.messageHandler.sendMessage('getState');
            } catch (stateError) {
                console.error(
                    'Failed to refresh state after completion:',
                    stateError
                );
            }
        }

        if (state && Array.isArray(state.tasks)) {
            this.renderTasksList(state.tasks, state.currentTaskId);
            this.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);
        }

        this.updateSelectionBar();
    }

    async performBulkCompleteRequest(taskIds) {
        try {
            return await this.messageHandler.sendMessage('completeTasks', {
                taskIds,
            });
        } catch (error) {
            if (error && error.message === 'Unknown action') {
                console.warn(
                    'Bulk complete action unsupported; falling back to sequential updates.'
                );
                let latestState = null;
                for (const taskId of taskIds) {
                    latestState = await this.messageHandler.sendMessage(
                        'updateTask',
                        {
                            taskId,
                            updates: { isCompleted: true },
                        }
                    );
                }
                return latestState;
            }
            throw error;
        }
    }

    async performBulkDeleteRequest(taskIds) {
        try {
            return await this.messageHandler.sendMessage('deleteTasks', {
                taskIds,
            });
        } catch (error) {
            if (error && error.message === 'Unknown action') {
                console.warn(
                    'Bulk delete action unsupported; falling back to sequential deletions.'
                );
                let latestState = null;
                for (const taskId of taskIds) {
                    latestState = await this.messageHandler.sendMessage(
                        'deleteTask',
                        { taskId }
                    );
                }
                return latestState;
            }
            throw error;
        }
    }

    /**
     * Setup description expand / collapse toggles for overflowing text
     */
    setupDescriptionToggles() {
        document.querySelectorAll('.task-item__description').forEach((desc) => {
            if (desc.dataset.processed === 'true') {
                return;
            }

            const rawText = (desc.textContent || '').trim();
            if (!rawText) {
                desc.dataset.processed = 'true';
                return;
            }

            // Wrap contents if not already
            if (!desc.querySelector('.task-item__desc-text')) {
                const wrapper = document.createElement('span');
                wrapper.className = 'task-item__desc-text';
                while (desc.firstChild) {
                    wrapper.appendChild(desc.firstChild);
                }
                desc.appendChild(wrapper);
            }

            // Remove any previous state
            desc.classList.remove('clamped', 'expanded');

            // Measure full height
            const fullHeight = desc.scrollHeight;
            const style = window.getComputedStyle(desc);
            let lineHeight = parseFloat(style.lineHeight);
            if (Number.isNaN(lineHeight)) {
                lineHeight = 16;
            }

            // Apply clamp to compute visible height
            desc.classList.add('clamped');
            const visibleHeight = desc.offsetHeight; // offsetHeight reflects the clamped box

            // Determine overflow if more than ~0.5 line hidden OR char heuristic fallback
            const hiddenHeight = fullHeight - visibleHeight;
            const charFallback = rawText.length > 120; // if very long text, assume overflow in case measurements fail
            const isOverflowing =
                hiddenHeight > lineHeight * 0.5 || charFallback;

            if (!isOverflowing) {
                desc.classList.remove('clamped');
                desc.dataset.processed = 'true';
                return;
            }

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'task-item__desc-toggle-inline';
            toggle.textContent = 'more';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const expanded =
                    toggle.getAttribute('aria-expanded') === 'true';
                if (expanded) {
                    desc.classList.add('clamped');
                    desc.classList.remove('expanded');
                    toggle.textContent = 'more';
                    toggle.setAttribute('aria-expanded', 'false');
                } else {
                    desc.classList.remove('clamped');
                    desc.classList.add('expanded');
                    toggle.textContent = 'less';
                    toggle.setAttribute('aria-expanded', 'true');
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
        triggers.forEach((trigger) => {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = trigger.closest('.task-item__menu');
                const expanded =
                    trigger.getAttribute('aria-expanded') === 'true';
                this.closeAllMenus();
                if (!expanded) {
                    trigger.setAttribute('aria-expanded', 'true');
                    menu.classList.add('open');
                    const card = trigger.closest('.task-item');
                    if (card) {
                        card.classList.add('task-item--menu-open');
                    }
                }
            });
        });
        if (!this._menuOutsideHandler) {
            this._menuOutsideHandler = (e) => {
                if (!e.target.closest('.task-item__menu')) {
                    this.closeAllMenus();
                }
            };
            document.addEventListener('click', this._menuOutsideHandler);
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeAllMenus();
                }
            });
        }
    }

    closeAllMenus() {
        document.querySelectorAll('.task-item__menu.open').forEach((menu) => {
            menu.classList.remove('open');
            const card = menu.closest('.task-item');
            if (card) {
                card.classList.remove('task-item--menu-open');
            }
        });
        document
            .querySelectorAll('.task-item__menu-trigger[aria-expanded="true"]')
            .forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
    }

    /**
     * Select a task as current
     */
    async selectTask(taskId) {
        try {
            // Fetch latest full state to determine current selection
            const stateResponse =
                await this.messageHandler.sendMessage('getState');
            const tasks = stateResponse.tasks || [];
            const task = tasks.find((t) => t.id === taskId);
            const currentTaskId = stateResponse.currentTaskId;

            // If clicking the currently active task, unset it
            if (currentTaskId === taskId) {
                const state = await this.messageHandler.sendMessage(
                    'setCurrentTask',
                    { taskId: null }
                );
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
                const shouldReopen = window.confirm(
                    'This task is completed. Reopen and set as current?'
                );
                if (shouldReopen) {
                    await this.toggleTaskCompletion(taskId, false);
                } else {
                    return;
                }
            }

            const state = await this.messageHandler.sendMessage(
                'setCurrentTask',
                { taskId }
            );

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
            const task = response.tasks.find((t) => t.id === taskId);
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
            const state = await this.messageHandler.sendMessage('deleteTask', {
                taskId,
            });

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
                updates: { isCompleted },
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
                document.getElementById('taskDescription').value =
                    task.description || '';
                document.getElementById('taskEstimate').value =
                    task.estimatedPomodoros;
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
                const state = await this.messageHandler.sendMessage(
                    'updateTask',
                    {
                        taskId: this.currentEditingTaskId,
                        updates: {
                            title: formData.title,
                            description: formData.description,
                            estimatedPomodoros: formData.estimatedPomodoros,
                        },
                    }
                );

                // Refresh UI with updated state
                this.renderTasksList(state.tasks, state.currentTaskId);
                this.updateCurrentTaskDisplay(state.currentTaskId, state.tasks);
            } else {
                // Create new task
                const state = await this.messageHandler.sendMessage(
                    'createTask',
                    {
                        task: formData,
                    }
                );

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
        const currentTaskElement = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.currentTask
        );
        const currentTaskName = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.currentTaskName
        );
        const currentTaskProgress = utils.getElement(
            POPUP_CONSTANTS.SELECTORS.currentTaskProgress
        );

        if (!currentTaskElement || !currentTaskName || !currentTaskProgress) {
            return;
        }

        if (!currentTaskId) {
            currentTaskElement.classList.add('hidden');
            return;
        }

        const currentTask = tasks.find((t) => t.id === currentTaskId);
        if (!currentTask) {
            currentTaskElement.classList.add('hidden');
            return;
        }

        currentTaskElement.classList.remove('hidden');
        currentTaskName.textContent = currentTask.title;
        currentTaskProgress.textContent = `${currentTask.completedPomodoros}/${currentTask.estimatedPomodoros} 🍅`;
    }
}

TaskUIManager.prototype.setupJiraSyncButton = function () {
    const btn = utils.getElement(POPUP_CONSTANTS.SELECTORS.syncJiraBtn);
    if (!btn) {
        return;
    }
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
            const state = await this.messageHandler.sendMessage('getState');
            const settings = state?.settings || {};
            if (
                !settings.jiraUrl ||
                !settings.jiraUsername ||
                !settings.jiraToken
            ) {
                notifyError(
                    'Enter Jira URL, username, and token before syncing.'
                );
                return;
            }
            const permissionGranted = await requestJiraPermission(
                settings.jiraUrl
            );
            if (!permissionGranted) {
                notifyError(
                    'Jira permission not granted. Enable access to sync Jira tasks.'
                );
                return;
            }
            await this.messageHandler.sendMessage('reconfigureJiraSync');
            const updatedState =
                await this.messageHandler.sendMessage('importJiraTasks');
            this.renderTasksList(
                updatedState.tasks || [],
                updatedState.currentTaskId
            );
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
