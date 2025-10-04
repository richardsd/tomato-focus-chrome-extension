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

function formatDate(value) {
    if (!value) {
        return 'Unknown';
    }
    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return 'Unknown';
        }
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch (error) {
        console.warn('Failed to format date', error);
        return 'Unknown';
    }
}

export class DashboardTaskManager {
    constructor(options) {
        const { container, messenger, onStateUpdate, refreshState } =
            options || {};
        this.container = container;
        this.messenger = messenger;
        this.onStateUpdate = onStateUpdate;
        this.refreshState = refreshState;

        this.form = this.container?.querySelector('#dashboardTaskForm');
        this.formErrors = this.container?.querySelector(
            '#dashboardTaskFormErrors'
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
            '#dashboardCurrentTask'
        );
        this.clearCurrentButton = this.container?.querySelector(
            '#dashboardClearCurrentTask'
        );
        this.refreshButton = this.container?.querySelector(
            '#dashboardRefreshTasks'
        );

        this.state = {
            tasks: [],
            currentTaskId: null,
        };
    }

    init() {
        if (this.form) {
            this.form.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleCreateTask();
            });
        }

        if (this.tasksList) {
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
                    case 'select':
                        this.handleSelectTask(taskId);
                        break;
                    case 'toggle-complete':
                        this.handleToggleComplete(taskId);
                        break;
                    case 'edit':
                        this.handleEditTask(taskId);
                        break;
                    case 'delete':
                        this.handleDeleteTask(taskId);
                        break;
                    default:
                        break;
                }
            });
        }

        if (this.clearCurrentButton) {
            this.clearCurrentButton.addEventListener('click', () => {
                this.handleSelectTask(null);
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

    render(state) {
        if (!state) {
            return;
        }
        this.state = {
            tasks: Array.isArray(state.tasks) ? state.tasks : [],
            currentTaskId: state.currentTaskId || null,
        };
        this.renderCurrentTask();
        this.renderTasksList();
    }

    renderCurrentTask() {
        if (!this.currentTaskElement) {
            return;
        }

        const { tasks, currentTaskId } = this.state;
        const currentTask = tasks.find((task) => task.id === currentTaskId);

        if (!currentTask) {
            this.currentTaskElement.innerHTML =
                '<p class="empty-state">No task selected.</p>';
            return;
        }

        const completionText = `${currentTask.completedPomodoros || 0}/${
            currentTask.estimatedPomodoros || 0
        } 🍅`;

        this.currentTaskElement.innerHTML = `
            <div class="current-task-panel__title">${escapeHtml(
                currentTask.title || 'Untitled task'
            )}</div>
            <div class="current-task-panel__meta">${escapeHtml(
                currentTask.description || 'No description provided.'
            )}</div>
            <div class="current-task-panel__meta">${completionText}</div>
        `;
    }

    renderTasksList() {
        if (!this.tasksList) {
            return;
        }

        const { tasks, currentTaskId } = this.state;
        if (!tasks.length) {
            this.tasksList.innerHTML =
                '<p class="empty-state">No tasks yet — add your first task above.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        tasks.forEach((task) => {
            const item = document.createElement('div');
            item.className = `tasks-list__item${
                task.isCompleted ? ' completed' : ''
            }`;
            item.dataset.taskId = task.id;

            const description = task.description
                ? `<p class="tasks-list__description">${escapeHtml(
                      task.description
                  )}</p>`
                : '';

            const meta = [
                `Pomodoros: ${task.completedPomodoros || 0}/${
                    task.estimatedPomodoros || 0
                }`,
                `Created: ${formatDate(task.createdAt)}`,
            ];

            if (task.completedAt) {
                meta.push(`Completed: ${formatDate(task.completedAt)}`);
            }

            item.innerHTML = `
                <div class="tasks-list__content">
                    <h3 class="tasks-list__title">${escapeHtml(
                        task.title || 'Untitled task'
                    )}</h3>
                    ${description}
                    <div class="tasks-list__meta">
                        ${meta.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}
                    </div>
                </div>
                <div class="tasks-list__actions">
                    <button type="button" data-action="select" data-task-id="${
                        task.id
                    }">
                        ${
                            currentTaskId === task.id
                                ? 'Selected'
                                : 'Set current'
                        }
                    </button>
                    <button type="button" data-action="toggle-complete" data-task-id="${
                        task.id
                    }">
                        ${task.isCompleted ? 'Mark active' : 'Mark complete'}
                    </button>
                    <button type="button" data-action="edit" data-task-id="${
                        task.id
                    }">Edit</button>
                    <button type="button" data-action="delete" data-task-id="${
                        task.id
                    }">Delete</button>
                </div>
            `;

            fragment.appendChild(item);
        });

        this.tasksList.innerHTML = '';
        this.tasksList.appendChild(fragment);
    }

    async handleCreateTask() {
        if (!this.messenger) {
            return;
        }

        const title = this.titleInput?.value?.trim();
        const description = this.descriptionInput?.value?.trim();
        const estimated = Number.parseInt(this.estimateInput?.value || '1', 10);

        if (!title) {
            this.showFormError('Task title is required.');
            return;
        }

        if (!Number.isFinite(estimated) || estimated < 1) {
            this.showFormError('Estimated pomodoros must be at least 1.');
            return;
        }

        this.showFormError('');

        try {
            const state = await this.messenger.sendMessage('createTask', {
                task: {
                    title,
                    description,
                    estimatedPomodoros: estimated,
                },
            });
            if (typeof this.onStateUpdate === 'function') {
                this.onStateUpdate(state);
            }
            this.resetForm();
        } catch (error) {
            console.error('Failed to create task', error);
            this.showFormError('Failed to create task. Please try again.');
        }
    }

    async handleSelectTask(taskId) {
        if (!this.messenger) {
            return;
        }

        try {
            const state = await this.messenger.sendMessage('setCurrentTask', {
                taskId,
            });
            if (typeof this.onStateUpdate === 'function') {
                this.onStateUpdate(state);
            }
        } catch (error) {
            console.error('Failed to select task', error);
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
                state = await this.messenger.sendMessage('updateTask', {
                    taskId,
                    updates: { isCompleted: false },
                });
            } else {
                state = await this.messenger.sendMessage('completeTasks', {
                    taskIds: [taskId],
                });
            }
            if (typeof this.onStateUpdate === 'function') {
                this.onStateUpdate(state);
            }
        } catch (error) {
            console.error('Failed to toggle task completion', error);
        }
    }

    async handleEditTask(taskId) {
        const task = this.state.tasks.find((item) => item.id === taskId);
        if (!task || !this.messenger) {
            return;
        }

        const newTitle = window.prompt(
            'Update task title',
            task.title || 'Untitled task'
        );
        if (newTitle === null) {
            return;
        }

        const newDescription = window.prompt(
            'Update task description (leave empty for none)',
            task.description || ''
        );
        if (newDescription === null) {
            return;
        }

        const estimatePrompt = window.prompt(
            'Update estimated pomodoros',
            String(task.estimatedPomodoros || 1)
        );
        if (estimatePrompt === null) {
            return;
        }

        const newEstimate = Number.parseInt(estimatePrompt, 10);
        if (!Number.isFinite(newEstimate) || newEstimate < 1) {
            window.alert('Estimated pomodoros must be a positive number.');
            return;
        }

        const updates = {
            title: newTitle.trim() || 'Untitled task',
            description: newDescription.trim(),
            estimatedPomodoros: newEstimate,
        };

        try {
            const state = await this.messenger.sendMessage('updateTask', {
                taskId,
                updates,
            });
            if (typeof this.onStateUpdate === 'function') {
                this.onStateUpdate(state);
            }
        } catch (error) {
            console.error('Failed to update task', error);
        }
    }

    async handleDeleteTask(taskId) {
        if (!this.messenger) {
            return;
        }

        const confirmDelete = window.confirm(
            'Delete this task? This action cannot be undone.'
        );
        if (!confirmDelete) {
            return;
        }

        try {
            const state = await this.messenger.sendMessage('deleteTasks', {
                taskIds: [taskId],
            });
            if (typeof this.onStateUpdate === 'function') {
                this.onStateUpdate(state);
            }
        } catch (error) {
            console.error('Failed to delete task', error);
        }
    }

    resetForm() {
        if (this.form) {
            this.form.reset();
        }
        if (this.estimateInput) {
            this.estimateInput.value = '1';
        }
    }

    showFormError(message) {
        if (!this.formErrors) {
            return;
        }
        if (!message) {
            this.formErrors.textContent = '';
            this.formErrors.classList.add('hidden');
            return;
        }
        this.formErrors.textContent = message;
        this.formErrors.classList.remove('hidden');
    }
}
