import { POPUP_CONSTANTS, utils } from '../popup/common.js';
import { ACTIONS } from '../shared/runtimeActions.js';

const QUOTE_STORAGE_KEY = 'tomato-focus-dashboard-quote-hidden';

function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => fn(...args), delay);
    };
}

function formatDate(value) {
    if (!value) {
        return 'Unknown';
    }
    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return 'Unknown';
        }
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch (error) {
        console.warn('Failed to format date', error);
        return 'Unknown';
    }
}

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getTaskStatus(task, currentTaskId) {
    if (task.isCompleted) {
        return 'completed';
    }
    if (currentTaskId && currentTaskId === task.id) {
        return 'in-progress';
    }
    return 'pending';
}

function buildMetadata(task) {
    const items = [];
    items.push(
        `Pomodoros ${task.completedPomodoros || 0}/${
            task.estimatedPomodoros || 0
        }`
    );
    items.push(`Created ${formatDate(task.createdAt)}`);
    if (task.completedAt) {
        items.push(`Completed ${formatDate(task.completedAt)}`);
    }
    return items;
}

export class DashboardTaskManager {
    constructor(options) {
        const {
            container,
            messenger,
            onStateUpdate,
            refreshState,
            toastManager,
        } = options || {};
        this.container = container;
        this.messenger = messenger;
        this.onStateUpdate = onStateUpdate;
        this.refreshState = refreshState;
        this.toastManager = toastManager;

        this.form = this.container?.querySelector('#dashboardTaskForm');
        this.formErrors = this.container?.querySelector(
            '#dashboardTaskFormErrors'
        );
        this.titleError = this.container?.querySelector(
            '#dashboardTaskTitleError'
        );
        this.titleInput = this.container?.querySelector('#dashboardTaskTitle');
        this.descriptionInput = this.container?.querySelector(
            '#dashboardTaskDescription'
        );
        this.estimateInput = this.container?.querySelector(
            '#dashboardTaskEstimate'
        );
        this.tasksList = this.container?.querySelector('#dashboardTasksList');
        this.currentTaskElement = this.container?.querySelector(
            '#dashboardCurrentTaskCard'
        );
        this.focusStatus = this.container?.querySelector(
            '#dashboardFocusStatus'
        );
        this.focusMeta = this.container?.querySelector('#dashboardFocusMeta');
        this.focusTimer = this.container?.querySelector('#dashboardFocusTimer');
        this.focusPhase = this.container?.querySelector('#dashboardFocusPhase');
        this.focusDescription = this.container?.querySelector(
            '#dashboardFocusDescription'
        );
        this.focusQuote = this.container?.querySelector('#dashboardFocusQuote');
        this.quoteToggle = this.container?.querySelector(
            '#dashboardFocusQuoteToggle'
        );
        this.focusToggleButton = this.container?.querySelector(
            '#dashboardFocusToggle'
        );
        this.focusResetButton = this.container?.querySelector(
            '#dashboardFocusReset'
        );
        this.focusDetailsButton = this.container?.querySelector(
            '#dashboardFocusDetails'
        );
        this.clearCurrentButton = this.container?.querySelector(
            '#dashboardClearCurrentTask'
        );
        this.refreshButton = this.container?.querySelector(
            '#dashboardRefreshTasks'
        );

        this.newTaskButton = this.container?.querySelector(
            '#dashboardNewTaskButton'
        );
        this.composer = this.container?.querySelector('#dashboardTaskComposer');
        this.composerTitle = this.container?.querySelector(
            '#dashboardTaskComposerTitle'
        );
        this.composerClose = this.container?.querySelector(
            '#dashboardCloseComposer'
        );
        this.composerCancel = this.container?.querySelector(
            '#dashboardTaskCancel'
        );
        this.composerSubmit = this.container?.querySelector(
            '#dashboardTaskSubmit'
        );

        this.filterButtons = Array.from(
            this.container?.querySelectorAll('[data-task-filter]') || []
        );
        this.searchInput = this.container?.querySelector(
            '#dashboardTaskSearch'
        );
        this.searchClear = this.container?.querySelector(
            '#dashboardTaskSearchClear'
        );

        this.state = {
            tasks: [],
            currentTaskId: null,
            timeLeft: POPUP_CONSTANTS.DEFAULT_STATE.timeLeft,
            isRunning: false,
            isWorkSession: true,
        };

        this.activeFilter = 'all';
        this.searchQuery = '';
        this.editingTaskId = null;
        this.quoteHidden = false;
        this.debouncedRenderTasks = debounce(() => this.renderTasksList(), 250);
    }

    init() {
        this.bindComposer();
        this.bindFilters();
        this.bindTasksList();
        this.bindFocusControls();
        this.restoreQuotePreference();
        this.updateQuoteVisibility();
    }

    bindComposer() {
        if (this.newTaskButton) {
            this.newTaskButton.addEventListener('click', () => {
                this.openComposer();
            });
        }

        if (this.composerClose) {
            this.composerClose.addEventListener('click', () => {
                this.closeComposer();
            });
        }

        if (this.composerCancel) {
            this.composerCancel.addEventListener('click', () => {
                this.closeComposer();
            });
        }

        if (this.form) {
            this.form.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleSubmitTask();
            });

            this.form
                .querySelectorAll('.input-stepper__btn')
                .forEach((button) => {
                    button.addEventListener('click', () => {
                        this.handleComposerStepper(button);
                    });
                });
        }
    }

    bindFilters() {
        this.filterButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const value = button.dataset.taskFilter;
                if (value) {
                    this.activeFilter = value;
                    this.renderFilters();
                    this.renderTasksList();
                }
            });
        });

        if (this.searchInput) {
            this.searchInput.addEventListener('input', (event) => {
                this.searchQuery = event.target.value || '';
                this.renderFilters();
                this.debouncedRenderTasks();
            });
        }

        if (this.searchClear) {
            this.searchClear.addEventListener('click', () => {
                this.searchQuery = '';
                if (this.searchInput) {
                    this.searchInput.value = '';
                }
                this.renderFilters();
                this.renderTasksList();
            });
        }

        if (this.refreshButton) {
            this.refreshButton.addEventListener('click', async () => {
                if (typeof this.refreshState === 'function') {
                    await this.refreshState();
                }
            });
        }
    }

    bindTasksList() {
        if (!this.tasksList) {
            return;
        }
        this.tasksList.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) {
                return;
            }
            const taskId = button.dataset.taskId;
            if (!taskId) {
                return;
            }
            switch (button.dataset.action) {
                case 'start':
                    this.handleStartTask(taskId);
                    break;
                case 'set-current':
                    this.handleSelectTask(taskId);
                    break;
                case 'toggle-complete':
                    this.handleToggleComplete(taskId);
                    break;
                case 'edit':
                    this.openComposerForEdit(taskId);
                    break;
                case 'delete':
                    this.handleDeleteTask(taskId);
                    break;
                case 'view':
                    this.showTaskDetails(taskId);
                    break;
                default:
                    break;
            }
        });
    }

    bindFocusControls() {
        if (this.focusToggleButton) {
            this.focusToggleButton.addEventListener('click', () => {
                this.handleFocusToggle();
            });
        }

        if (this.focusResetButton) {
            this.focusResetButton.addEventListener('click', () => {
                this.handleFocusReset();
            });
        }

        if (this.clearCurrentButton) {
            this.clearCurrentButton.addEventListener('click', () => {
                this.handleSelectTask(null);
            });
        }

        if (this.focusDetailsButton) {
            this.focusDetailsButton.addEventListener('click', () => {
                if (!this.state.currentTaskId) {
                    return;
                }
                this.showTaskDetails(this.state.currentTaskId);
            });
        }

        if (this.quoteToggle) {
            this.quoteToggle.addEventListener('click', () => {
                this.quoteHidden = !this.quoteHidden;
                try {
                    window.localStorage.setItem(
                        QUOTE_STORAGE_KEY,
                        this.quoteHidden ? '1' : '0'
                    );
                } catch (error) {
                    console.warn('Failed to persist quote preference', error);
                }
                this.updateQuoteVisibility();
            });
        }
    }

    restoreQuotePreference() {
        try {
            this.quoteHidden =
                window.localStorage.getItem(QUOTE_STORAGE_KEY) === '1';
        } catch (error) {
            console.warn('Failed to read quote preference', error);
            this.quoteHidden = false;
        }
    }

    updateQuoteVisibility() {
        if (!this.focusQuote || !this.quoteToggle) {
            return;
        }
        if (this.quoteHidden) {
            this.focusQuote.setAttribute('hidden', 'hidden');
            this.quoteToggle.textContent = 'Show inspiration';
        } else {
            this.focusQuote.removeAttribute('hidden');
            this.quoteToggle.textContent = 'Hide inspiration';
        }
    }

    openComposer(task) {
        if (!this.composer) {
            return;
        }
        this.composer.removeAttribute('hidden');
        this.editingTaskId = task?.id || null;
        if (this.composerTitle) {
            this.composerTitle.textContent = this.editingTaskId
                ? 'Update task'
                : 'Create a task';
        }
        if (this.composerSubmit) {
            this.composerSubmit.textContent = this.editingTaskId
                ? 'Update task'
                : 'Save task';
        }
        this.populateComposer(task);
        this.clearComposerErrors();
        this.titleInput?.focus();
    }

    openComposerForEdit(taskId) {
        const task = this.state.tasks.find((item) => item.id === taskId);
        if (!task) {
            return;
        }
        this.openComposer(task);
    }

    populateComposer(task) {
        if (!task) {
            this.form?.reset();
            if (this.estimateInput) {
                this.estimateInput.value = '1';
            }
            return;
        }
        if (this.titleInput) {
            this.titleInput.value = task.title || '';
        }
        if (this.descriptionInput) {
            this.descriptionInput.value = task.description || '';
        }
        if (this.estimateInput) {
            this.estimateInput.value = String(task.estimatedPomodoros || 1);
        }
    }

    closeComposer() {
        if (!this.composer) {
            return;
        }
        this.composer.setAttribute('hidden', 'hidden');
        this.editingTaskId = null;
        this.clearComposerErrors();
    }

    clearComposerErrors() {
        if (this.formErrors) {
            this.formErrors.textContent = '';
        }
        if (this.titleError) {
            this.titleError.textContent = '';
        }
    }

    handleComposerStepper(button) {
        const direction = Number.parseInt(button.dataset.step || '0', 10);
        if (!Number.isFinite(direction) || !this.estimateInput) {
            return;
        }
        const current =
            Number.parseInt(this.estimateInput.value || '1', 10) || 1;
        const next = Math.max(1, current + direction);
        this.estimateInput.value = String(next);
    }

    async handleSubmitTask() {
        if (!this.messenger) {
            return;
        }

        const title = this.titleInput?.value?.trim();
        const description = this.descriptionInput?.value?.trim();
        const estimated = Number.parseInt(this.estimateInput?.value || '1', 10);

        this.clearComposerErrors();

        if (!title) {
            if (this.titleError) {
                this.titleError.textContent = 'Task title is required.';
            }
            return;
        }

        if (!Number.isFinite(estimated) || estimated < 1) {
            if (this.formErrors) {
                this.formErrors.textContent =
                    'Estimated pomodoros must be at least 1.';
            }
            return;
        }

        const payload = {
            title,
            description,
            estimatedPomodoros: estimated,
        };

        try {
            let state;
            if (this.editingTaskId) {
                state = await this.messenger.sendMessage(ACTIONS.UPDATE_TASK, {
                    taskId: this.editingTaskId,
                    updates: payload,
                });
                this.toastManager?.show('Task updated.', {
                    variant: 'success',
                });
            } else {
                state = await this.messenger.sendMessage(ACTIONS.CREATE_TASK, {
                    task: payload,
                });
                this.toastManager?.show('Task added.', { variant: 'success' });
            }
            this.onStateUpdate?.(state);
            this.closeComposer();
        } catch (error) {
            console.error('Failed to save task', error);
            if (this.formErrors) {
                this.formErrors.textContent =
                    'Something went wrong. Please try again.';
            }
            this.toastManager?.show('Failed to save task.', {
                variant: 'danger',
            });
        }
    }

    async handleSelectTask(taskId) {
        if (!this.messenger) {
            return;
        }
        try {
            const state = await this.messenger.sendMessage(ACTIONS.SET_CURRENT_TASK, {
                taskId,
            });
            this.onStateUpdate?.(state);
            if (taskId) {
                this.toastManager?.show('Current task updated.', {
                    variant: 'success',
                });
            } else {
                this.toastManager?.show('Focus task cleared.', {
                    variant: 'success',
                });
            }
        } catch (error) {
            console.error('Failed to select task', error);
            this.toastManager?.show('Unable to update current task.', {
                variant: 'danger',
            });
        }
    }

    async handleStartTask(taskId) {
        if (!this.messenger) {
            return;
        }

        try {
            if (this.state.currentTaskId !== taskId) {
                const state = await this.messenger.sendMessage(
                    ACTIONS.SET_CURRENT_TASK,
                    {
                        taskId,
                    }
                );
                this.onStateUpdate?.(state);
            }

            if (!this.state.isRunning) {
                await this.messenger.sendMessage(ACTIONS.TOGGLE_TIMER);
            }
            await this.refreshState?.();
            this.toastManager?.show('Timer started.', { variant: 'success' });
        } catch (error) {
            console.error('Failed to start focus for task', error);
            this.toastManager?.show('Unable to start timer.', {
                variant: 'danger',
            });
        }
    }

    async handleToggleComplete(taskId) {
        if (!this.messenger) {
            return;
        }
        const task = this.state.tasks.find((item) => item.id === taskId);
        if (!task) {
            return;
        }
        try {
            let state;
            if (task.isCompleted) {
                state = await this.messenger.sendMessage(ACTIONS.UPDATE_TASK, {
                    taskId,
                    updates: { isCompleted: false },
                });
                this.toastManager?.show('Task marked active.', {
                    variant: 'success',
                });
            } else {
                state = await this.messenger.sendMessage(ACTIONS.COMPLETE_TASKS, {
                    taskIds: [taskId],
                });
                this.toastManager?.show('Task completed. Nice work!', {
                    variant: 'success',
                });
            }
            this.onStateUpdate?.(state);
        } catch (error) {
            console.error('Failed to toggle task completion', error);
            this.toastManager?.show('Unable to update task.', {
                variant: 'danger',
            });
        }
    }

    async handleDeleteTask(taskId) {
        if (!this.messenger) {
            return;
        }
        const task = this.state.tasks.find((item) => item.id === taskId);
        const confirmDelete = window.confirm(
            task?.title
                ? `Delete "${task.title}"? This cannot be undone.`
                : 'Delete this task?'
        );
        if (!confirmDelete) {
            return;
        }
        try {
            const state = await this.messenger.sendMessage(ACTIONS.DELETE_TASKS, {
                taskIds: [taskId],
            });
            this.onStateUpdate?.(state);
            this.toastManager?.show('Task deleted.', { variant: 'success' });
        } catch (error) {
            console.error('Failed to delete task', error);
            this.toastManager?.show('Unable to delete task.', {
                variant: 'danger',
            });
        }
    }

    showTaskDetails(taskId) {
        const task = this.state.tasks.find((item) => item.id === taskId);
        if (!task) {
            return;
        }
        const details = [
            `Title: ${task.title || 'Untitled task'}`,
            `Description: ${task.description || 'No description'}`,
            `Pomodoros: ${task.completedPomodoros || 0}/${
                task.estimatedPomodoros || 0
            }`,
            `Created: ${formatDate(task.createdAt)}`,
        ];
        if (task.completedAt) {
            details.push(`Completed: ${formatDate(task.completedAt)}`);
        }
        window.alert(details.join('\n'));
    }

    async handleFocusToggle() {
        if (!this.messenger) {
            return;
        }
        if (!this.state.currentTaskId) {
            this.toastManager?.show('Choose a task to focus on first.', {
                variant: 'danger',
            });
            return;
        }
        try {
            await this.messenger.sendMessage(ACTIONS.TOGGLE_TIMER);
            await this.refreshState?.();
        } catch (error) {
            console.error('Failed to toggle timer', error);
            this.toastManager?.show('Unable to toggle timer.', {
                variant: 'danger',
            });
        }
    }

    async handleFocusReset() {
        if (!this.messenger) {
            return;
        }
        try {
            await this.messenger.sendMessage(ACTIONS.RESET_TIMER);
            await this.refreshState?.();
            this.toastManager?.show('Timer reset.', { variant: 'success' });
        } catch (error) {
            console.error('Failed to reset timer', error);
            this.toastManager?.show('Unable to reset timer.', {
                variant: 'danger',
            });
        }
    }

    render(state) {
        if (!state) {
            return;
        }
        this.state = {
            tasks: Array.isArray(state.tasks) ? state.tasks : [],
            currentTaskId: state.currentTaskId || null,
            timeLeft: Number.isFinite(state.timeLeft)
                ? state.timeLeft
                : POPUP_CONSTANTS.DEFAULT_STATE.timeLeft,
            isRunning: Boolean(state.isRunning),
            isWorkSession: Boolean(state.isWorkSession),
        };
        this.renderFilters();
        this.renderFocusCard();
        this.renderTasksList();
    }

    renderFilters() {
        this.filterButtons.forEach((button) => {
            const isActive = button.dataset.taskFilter === this.activeFilter;
            button.classList.toggle('is-active', isActive);
            if (isActive) {
                button.setAttribute('aria-pressed', 'true');
            } else {
                button.removeAttribute('aria-pressed');
            }
        });
        if (this.searchClear) {
            this.searchClear.disabled = !this.searchQuery;
        }
    }

    renderFocusCard() {
        if (!this.currentTaskElement) {
            return;
        }
        const { tasks, currentTaskId, timeLeft, isRunning, isWorkSession } =
            this.state;
        const currentTask = tasks.find((task) => task.id === currentTaskId);

        this.currentTaskElement.classList.remove(
            'is-running',
            'is-idle',
            'is-completed'
        );

        if (!currentTask) {
            if (this.focusStatus) {
                this.focusStatus.textContent = 'No task selected';
            }
            if (this.focusMeta) {
                this.focusMeta.textContent = '';
            }
            if (this.focusTimer) {
                this.focusTimer.textContent = utils.formatTime(timeLeft);
            }
            if (this.focusPhase) {
                this.focusPhase.textContent = isWorkSession
                    ? 'Focus session'
                    : 'Break';
            }
            if (this.focusDescription) {
                this.focusDescription.textContent =
                    'Pick a task from your list to start a focus sprint.';
            }
            if (this.focusToggleButton) {
                this.focusToggleButton.textContent = 'Start focus';
                this.focusToggleButton.disabled = true;
            }
            if (this.focusResetButton) {
                this.focusResetButton.disabled = false;
            }
            if (this.focusDetailsButton) {
                this.focusDetailsButton.disabled = true;
            }
            if (this.clearCurrentButton) {
                this.clearCurrentButton.disabled = true;
            }
            this.currentTaskElement.classList.add('is-idle');
            return;
        }

        const status = getTaskStatus(currentTask, currentTaskId);
        if (status === 'completed') {
            this.currentTaskElement.classList.add('is-completed');
            if (this.focusStatus) {
                this.focusStatus.textContent = 'Completed';
            }
        } else if (isRunning) {
            this.currentTaskElement.classList.add('is-running');
            if (this.focusStatus) {
                this.focusStatus.textContent = 'In progress';
            }
        } else {
            this.currentTaskElement.classList.add('is-idle');
            if (this.focusStatus) {
                this.focusStatus.textContent = 'Ready to focus';
            }
        }

        const meta = [
            `Pomodoros ${currentTask.completedPomodoros || 0}/${
                currentTask.estimatedPomodoros || 0
            }`,
        ];
        if (this.focusDescription) {
            this.focusDescription.textContent = currentTask.description
                ? currentTask.description
                : 'Add a description to capture why this task matters.';
        }
        if (this.focusMeta) {
            this.focusMeta.textContent = meta.join(' · ');
        }
        if (this.focusTimer) {
            this.focusTimer.textContent = utils.formatTime(timeLeft);
        }
        if (this.focusPhase) {
            this.focusPhase.textContent = isWorkSession
                ? 'Focus session'
                : 'Break';
        }
        if (this.focusToggleButton) {
            this.focusToggleButton.textContent = isRunning
                ? 'Pause focus'
                : 'Start focus';
            this.focusToggleButton.disabled = false;
        }
        if (this.focusResetButton) {
            this.focusResetButton.disabled = false;
        }
        if (this.focusDetailsButton) {
            this.focusDetailsButton.disabled = false;
        }
        if (this.clearCurrentButton) {
            this.clearCurrentButton.disabled = false;
        }
    }

    renderTasksList() {
        if (!this.tasksList) {
            return;
        }
        const { tasks, currentTaskId, isRunning } = this.state;
        const normalizedQuery = this.searchQuery.trim().toLowerCase();

        const filteredTasks = tasks.filter((task) => {
            const status = getTaskStatus(task, currentTaskId);
            if (this.activeFilter !== 'all' && status !== this.activeFilter) {
                return false;
            }
            if (!normalizedQuery) {
                return true;
            }
            const haystack =
                `${task.title || ''} ${task.description || ''}`.toLowerCase();
            return haystack.includes(normalizedQuery);
        });

        if (!filteredTasks.length) {
            this.tasksList.innerHTML =
                '<p class="empty-state">No tasks match your filters yet.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        filteredTasks.forEach((task) => {
            const status = getTaskStatus(task, currentTaskId);
            const card = document.createElement('article');
            card.className = 'task-card';
            card.setAttribute('role', 'listitem');
            if (currentTaskId === task.id) {
                card.classList.add('is-current');
            }

            const metadata = buildMetadata(task)
                .map((item) => `<span>${escapeHtml(item)}</span>`)
                .join('');

            card.innerHTML = `
                <div class="task-card__header">
                    <div>
                        <h3 class="task-card__title">${escapeHtml(
                            task.title || 'Untitled task'
                        )}</h3>
                        ${
                            task.description
                                ? `<p class="task-card__description">${escapeHtml(
                                      task.description
                                  )}</p>`
                                : ''
                        }
                    </div>
                    <span class="status-chip" data-status="${status}">
                        ${
                            status === 'pending'
                                ? 'Pending'
                                : status === 'completed'
                                  ? 'Completed'
                                  : 'In Progress'
                        }
                    </span>
                </div>
                <div class="task-card__meta">${metadata}</div>
                <div class="task-card__actions">
                    <button
                        type="button"
                        class="task-card__icon is-primary"
                        data-action="start"
                        data-task-id="${task.id}"
                        title="Start focus"
                        aria-label="Start focus for ${escapeHtml(
                            task.title || 'task'
                        )}"
                    >▶</button>
                    <button
                        type="button"
                        class="task-card__icon"
                        data-action="set-current"
                        data-task-id="${task.id}"
                        title="Set as current task"
                        aria-label="Set ${escapeHtml(
                            task.title || 'task'
                        )} as current"
                    >🎯</button>
                    <button
                        type="button"
                        class="task-card__icon"
                        data-action="toggle-complete"
                        data-task-id="${task.id}"
                        title="${task.isCompleted ? 'Mark active' : 'Mark complete'}"
                        aria-label="${task.isCompleted ? 'Mark active' : 'Mark complete'}"
                    >${task.isCompleted ? '↺' : '✓'}</button>
                    <button
                        type="button"
                        class="task-card__icon"
                        data-action="edit"
                        data-task-id="${task.id}"
                        title="Edit task"
                        aria-label="Edit ${escapeHtml(task.title || 'task')}"
                    >✎</button>
                    <button
                        type="button"
                        class="task-card__icon"
                        data-action="view"
                        data-task-id="${task.id}"
                        title="View details"
                        aria-label="View details for ${escapeHtml(
                            task.title || 'task'
                        )}"
                    >👁</button>
                    <button
                        type="button"
                        class="task-card__icon"
                        data-action="delete"
                        data-task-id="${task.id}"
                        title="Delete task"
                        aria-label="Delete ${escapeHtml(task.title || 'task')}"
                    >🗑</button>
                </div>
            `;

            if (isRunning && currentTaskId === task.id) {
                const startButton = card.querySelector(
                    'button[data-action="start"]'
                );
                if (startButton) {
                    startButton.disabled = true;
                }
            }

            fragment.appendChild(card);
        });

        this.tasksList.innerHTML = '';
        this.tasksList.appendChild(fragment);
    }
}
