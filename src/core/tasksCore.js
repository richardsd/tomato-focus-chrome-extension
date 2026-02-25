export function generateTaskId(now = Date.now) {
    return now().toString(36) + Math.random().toString(36).substring(2);
}

export function createTaskRecord(
    taskData = {},
    { idFactory = generateTaskId } = {}
) {
    return {
        id: idFactory(),
        title: taskData.title || 'Untitled Task',
        description: taskData.description || '',
        estimatedPomodoros: taskData.estimatedPomodoros || 1,
        completedPomodoros: 0,
        isCompleted: false,
        createdAt: new Date().toISOString(),
        completedAt: null,
    };
}

export function updateTaskRecord(task, updates = {}) {
    const nextUpdates = { ...updates };

    if (nextUpdates.isCompleted !== undefined) {
        nextUpdates.completedAt = nextUpdates.isCompleted
            ? new Date().toISOString()
            : null;
    }

    return { ...task, ...nextUpdates };
}

export function completeTaskRecords(tasks, taskIds) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return { tasks, changed: false };
    }

    const idsToComplete = new Set(taskIds.map((id) => String(id)));
    const nowIso = new Date().toISOString();
    let changed = false;

    const updatedTasks = tasks.map((task) => {
        if (!idsToComplete.has(task.id)) {
            return task;
        }

        const nextTask = { ...task };
        if (!nextTask.isCompleted) {
            nextTask.isCompleted = true;
            nextTask.completedAt = nowIso;
            changed = true;
        } else if (!nextTask.completedAt) {
            nextTask.completedAt = nowIso;
            changed = true;
        }

        return nextTask;
    });

    return { tasks: updatedTasks, changed };
}

export function deleteTaskRecords(tasks, taskIds) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return tasks;
    }
    const idsToDelete = new Set(taskIds.map((id) => String(id)));
    return tasks.filter((task) => !idsToDelete.has(task.id));
}

export function incrementTaskPomodoro(task) {
    return {
        ...task,
        completedPomodoros: Number(task.completedPomodoros || 0) + 1,
    };
}
