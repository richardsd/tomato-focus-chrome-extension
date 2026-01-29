const escapeHtml = (text = '') => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

export const renderTaskItem = (task, state = {}) => {
    const { currentTaskId = null, selectedTaskIds = [] } = state;
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
    const isSelected = selectedTaskIds.includes(String(task.id));
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

    const title = task.title ?? '';
    const description = task.description ?? '';

    // Truncate title if it's too long (max 50 characters)
    const truncatedTitle =
        title.length > 50 ? `${title.substring(0, 47)}...` : title;

    return `
        <div class="${itemClasses.join(' ')}"
             data-task-id="${task.id}" aria-label="Task: ${escapeHtml(title)}. ${statusText}. Progress ${progress} pomodoros." tabindex="0">
            <div class="task-item__header">
                <div class="task-item__selection">
                    <input type="checkbox" class="task-item__checkbox" data-task-id="${task.id}" ${isSelected ? 'checked' : ''} aria-label="Select task ${escapeHtml(title)}">
                </div>
                <div class="task-item__title ${task.isCompleted ? 'completed' : ''}" title="${escapeHtml(title)}">
                    ${escapeHtml(truncatedTitle)}
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
            ${description ? `<div class="task-item__description" data-has-description="true" title="${escapeHtml(description)}">${escapeHtml(description)}</div>` : ''}
            <div class="task-item__footer">
                <div class="task-item__progress" aria-label="Progress: ${progress} pomodoros; Status: ${statusText}">
                    <div class="task-item__pomodoros" aria-hidden="false">🍅 ${progress}</div>
                    <div class="task-item__status ${statusClass}" role="status">${statusText}</div>
                </div>
            </div>
        </div>
    `;
};
