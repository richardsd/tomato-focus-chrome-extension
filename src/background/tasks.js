import { CONSTANTS } from './constants.js';
import { createChromeStorageAdapter } from './adapters/chromeAdapters.js';
import {
    completeTaskRecords,
    createTaskRecord,
    deleteTaskRecords,
    incrementTaskPomodoro,
    updateTaskRecord,
} from '../core/tasksCore.js';

function normalizeTaskPayload(taskData = {}) {
    const normalizedTitle = String(taskData.title || '').trim();
    const estimate = Number.parseInt(taskData.estimatedPomodoros, 10);

    return {
        ...taskData,
        title: normalizedTitle || 'Untitled Task',
        description: String(taskData.description || '').trim(),
        estimatedPomodoros:
            Number.isFinite(estimate) && estimate > 0 ? estimate : 1,
    };
}

export class TaskManager {
    static storage = createChromeStorageAdapter();

    static async getTasks() {
        try {
            const result = await this.storage.get([CONSTANTS.TASKS_KEY]);
            return result[CONSTANTS.TASKS_KEY] || [];
        } catch (error) {
            console.error('Failed to load tasks:', error);
            return [];
        }
    }

    static async saveTasks(tasks) {
        try {
            await this.storage.set({
                [CONSTANTS.TASKS_KEY]: tasks,
            });
        } catch (error) {
            console.error('Failed to save tasks:', error);
        }
    }

    static async createTask(taskData) {
        const tasks = await this.getTasks();
        const newTask = createTaskRecord(normalizeTaskPayload(taskData));
        tasks.push(newTask);
        await this.saveTasks(tasks);
        return newTask;
    }

    static async updateTask(taskId, updates) {
        const tasks = await this.getTasks();
        const taskIndex = tasks.findIndex((task) => task.id === taskId);

        if (taskIndex === -1) {
            throw new Error('Task not found');
        }

        tasks[taskIndex] = updateTaskRecord(
            tasks[taskIndex],
            normalizeTaskPayload({ ...tasks[taskIndex], ...updates })
        );
        await this.saveTasks(tasks);
        return tasks[taskIndex];
    }

    static async deleteTask(taskId) {
        const tasks = await this.getTasks();
        const filteredTasks = tasks.filter((task) => task.id !== taskId);
        await this.saveTasks(filteredTasks);
        return true;
    }

    static async deleteTasks(taskIds) {
        const tasks = await this.getTasks();
        const filteredTasks = deleteTaskRecords(tasks, taskIds);

        if (filteredTasks.length !== tasks.length) {
            await this.saveTasks(filteredTasks);
        }

        return filteredTasks;
    }

    static async completeTasks(taskIds) {
        const tasks = await this.getTasks();
        const completed = completeTaskRecords(tasks, taskIds);

        if (completed.changed) {
            await this.saveTasks(completed.tasks);
            return completed.tasks;
        }

        return tasks;
    }

    static async incrementTaskPomodoros(taskId) {
        const tasks = await this.getTasks();
        const taskIndex = tasks.findIndex((task) => task.id === taskId);

        if (taskIndex === -1) {
            console.warn('Task not found for incrementing pomodoros:', taskId);
            return null;
        }

        tasks[taskIndex] = incrementTaskPomodoro(tasks[taskIndex]);
        await this.saveTasks(tasks);
        return tasks[taskIndex];
    }

    static async getTaskById(taskId) {
        const tasks = await this.getTasks();
        return tasks.find((task) => task.id === taskId) || null;
    }

    static async clearCompletedTasks() {
        const tasks = await this.getTasks();
        const activeTasks = tasks.filter((task) => !task.isCompleted);
        await this.saveTasks(activeTasks);
        return activeTasks;
    }
}
