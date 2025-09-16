import { CONSTANTS, chromePromise } from './constants.js';

export class TaskManager {
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    static async getTasks() {
        try {
            const result = await chromePromise.storage.local.get([CONSTANTS.TASKS_KEY]);
            return result[CONSTANTS.TASKS_KEY] || [];
        } catch (error) {
            console.error('Failed to load tasks:', error);
            return [];
        }
    }

    static async saveTasks(tasks) {
        try {
            await chromePromise.storage.local.set({
                [CONSTANTS.TASKS_KEY]: tasks
            });
        } catch (error) {
            console.error('Failed to save tasks:', error);
        }
    }

    static async createTask(taskData) {
        const tasks = await this.getTasks();
        const jiraKey = typeof taskData.jiraKey === 'string'
            ? taskData.jiraKey.trim()
            : '';
        const newTask = {
            id: this.generateId(),
            title: taskData.title || 'Untitled Task',
            description: taskData.description || '',
            estimatedPomodoros: taskData.estimatedPomodoros || 1,
            jiraKey: jiraKey || null,
            completedPomodoros: 0,
            isCompleted: false,
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        tasks.push(newTask);
        await this.saveTasks(tasks);
        return newTask;
    }

    static async updateTask(taskId, updates) {
        const tasks = await this.getTasks();
        const taskIndex = tasks.findIndex(task => task.id === taskId);

        if (taskIndex === -1) {
            throw new Error('Task not found');
        }

        // Handle completion status timestamps only; do NOT auto-adjust pomodoro counts
        if (updates.isCompleted !== undefined) {
            updates.completedAt = updates.isCompleted ? new Date().toISOString() : null;
            // We intentionally do not modify completedPomodoros here; user retains recorded effort
        }

        tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
        await this.saveTasks(tasks);
        return tasks[taskIndex];
    }

    static async deleteTask(taskId) {
        const tasks = await this.getTasks();
        const filteredTasks = tasks.filter(task => task.id !== taskId);
        await this.saveTasks(filteredTasks);
        return true;
    }

    static async incrementTaskPomodoros(taskId) {
        const tasks = await this.getTasks();
        const task = tasks.find(task => task.id === taskId);

        if (!task) {
            console.warn('Task not found for incrementing pomodoros:', taskId);
            return null;
        }

        task.completedPomodoros++;

        // Do NOT auto-complete when reaching estimate; user must mark manually.

        await this.saveTasks(tasks);
        return task;
    }

    static async getTaskById(taskId) {
        const tasks = await this.getTasks();
        return tasks.find(task => task.id === taskId) || null;
    }

    static async clearCompletedTasks() {
        const tasks = await this.getTasks();
        const activeTasks = tasks.filter(task => !task.isCompleted);
        await this.saveTasks(activeTasks);
        return activeTasks;
    }
}
