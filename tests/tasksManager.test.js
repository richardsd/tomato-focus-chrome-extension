import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TaskManager } from '../src/background/tasks.js';
import { CONSTANTS } from '../src/background/constants.js';

describe('TaskManager task operations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('createTask applies defaults and persists the new task', async () => {
        vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

        const newTask = await TaskManager.createTask({});
        const storedTasks = await TaskManager.getTasks();

        expect(newTask.id).toBeTypeOf('string');
        expect(newTask.title).toBe('Untitled Task');
        expect(newTask.description).toBe('');
        expect(newTask.estimatedPomodoros).toBe(1);
        expect(newTask.completedPomodoros).toBe(0);
        expect(newTask.isCompleted).toBe(false);
        expect(newTask.createdAt).toBe('2025-01-01T00:00:00.000Z');
        expect(newTask.completedAt).toBeNull();
        expect(storedTasks).toEqual([newTask]);
    });

    it('updateTask sets completedAt when completing and clears it when uncompleting', async () => {
        vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

        const task = await TaskManager.createTask({
            title: 'A',
            completedPomodoros: 2,
        });

        vi.setSystemTime(new Date('2025-01-01T00:10:00.000Z'));
        const completed = await TaskManager.updateTask(task.id, {
            isCompleted: true,
        });
        expect(completed.isCompleted).toBe(true);
        expect(completed.completedAt).toBe('2025-01-01T00:10:00.000Z');

        vi.setSystemTime(new Date('2025-01-01T00:20:00.000Z'));
        const reopened = await TaskManager.updateTask(task.id, {
            isCompleted: false,
        });
        expect(reopened.isCompleted).toBe(false);
        expect(reopened.completedAt).toBeNull();
    });

    it('deleteTask and deleteTasks remove matching IDs', async () => {
        const taskA = await TaskManager.createTask({ title: 'A' });
        const taskB = await TaskManager.createTask({ title: 'B' });
        const taskC = await TaskManager.createTask({ title: 'C' });

        await TaskManager.deleteTask(taskB.id);
        let tasks = await TaskManager.getTasks();
        expect(tasks.map((task) => task.id)).toEqual([taskA.id, taskC.id]);

        const remaining = await TaskManager.deleteTasks([taskA.id]);
        expect(remaining.map((task) => task.id)).toEqual([taskC.id]);
        tasks = await TaskManager.getTasks();
        expect(tasks.map((task) => task.id)).toEqual([taskC.id]);
    });

    it('completeTasks marks incomplete tasks and backfills missing completedAt', async () => {
        vi.setSystemTime(new Date('2025-01-01T00:30:00.000Z'));

        await chrome.storage.local.set({
            [CONSTANTS.TASKS_KEY]: [
                {
                    id: '1',
                    title: 'Incomplete',
                    isCompleted: false,
                    completedAt: null,
                    completedPomodoros: 0,
                },
                {
                    id: '2',
                    title: 'Completed no timestamp',
                    isCompleted: true,
                    completedAt: null,
                    completedPomodoros: 1,
                },
                {
                    id: '3',
                    title: 'Already completed',
                    isCompleted: true,
                    completedAt: '2024-01-01T00:00:00.000Z',
                    completedPomodoros: 2,
                },
            ],
        });

        const updated = await TaskManager.completeTasks(['1', '2', '3']);

        expect(updated[0].isCompleted).toBe(true);
        expect(updated[0].completedAt).toBe('2025-01-01T00:30:00.000Z');
        expect(updated[1].completedAt).toBe('2025-01-01T00:30:00.000Z');
        expect(updated[2].completedAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('incrementTaskPomodoros increments existing task and returns null for missing task', async () => {
        const task = await TaskManager.createTask({ title: 'Pomodoro Task' });

        const incremented = await TaskManager.incrementTaskPomodoros(task.id);
        expect(incremented.completedPomodoros).toBe(1);

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const missing = await TaskManager.incrementTaskPomodoros('missing-id');
        expect(missing).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            'Task not found for incrementing pomodoros:',
            'missing-id'
        );
    });

    it('clearCompletedTasks removes completed tasks and persists only active tasks', async () => {
        await chrome.storage.local.set({
            [CONSTANTS.TASKS_KEY]: [
                { id: '1', isCompleted: false, title: 'Active' },
                { id: '2', isCompleted: true, title: 'Done' },
            ],
        });

        const active = await TaskManager.clearCompletedTasks();

        expect(active).toEqual([
            { id: '1', isCompleted: false, title: 'Active' },
        ]);
        const persisted = await TaskManager.getTasks();
        expect(persisted).toEqual(active);
    });
});
