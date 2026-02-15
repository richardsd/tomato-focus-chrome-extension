import { describe, it, expect, vi, beforeEach } from 'vitest';

import { StorageManager } from '../src/background/storageManager.js';
import { CONSTANTS, chromePromise } from '../src/background/constants.js';
import { createDefaultState } from '../src/shared/stateDefaults.js';

describe('StorageManager.saveState/loadState error handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('saveState logs errors when storage write fails', async () => {
        const error = new Error('write failed');
        vi.spyOn(chromePromise.storage.local, 'set').mockRejectedValueOnce(
            error
        );
        const consoleErrorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        await StorageManager.saveState({ foo: 'bar' });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to save state:',
            error
        );
    });

    it('loadState returns null and logs errors when storage read fails', async () => {
        const error = new Error('read failed');
        vi.spyOn(chromePromise.storage.local, 'get').mockRejectedValueOnce(
            error
        );
        const consoleErrorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        const state = await StorageManager.loadState();

        expect(state).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to load state:',
            error
        );
    });

    it('loadState returns saved value and null when key does not exist', async () => {
        const storedState = { timeLeft: 1200 };

        chrome.storage.local.set({ [CONSTANTS.STORAGE_KEY]: storedState });
        await expect(StorageManager.loadState()).resolves.toEqual(storedState);

        chrome.storage.local.remove(CONSTANTS.STORAGE_KEY);
        await expect(StorageManager.loadState()).resolves.toBeNull();
    });
});

describe('StorageManager.applySavedState', () => {
    it('returns false and applies default state when savedState is null', () => {
        const state = { custom: true };

        const applied = StorageManager.applySavedState(state, null);
        const defaults = createDefaultState();

        expect(applied).toBe(false);
        expect(state).toMatchObject(defaults);
        expect(state.custom).toBe(true);
    });

    it('merges defaults/settings/uiPreferences and normalizes invalid tasks', () => {
        vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

        const state = { shouldBeOverwritten: true };
        const savedState = {
            currentSession: 3,
            settings: {
                workDuration: 50,
                autoStart: true,
            },
            tasks: { invalid: true },
            uiPreferences: {
                hideCompleted: true,
            },
        };

        const applied = StorageManager.applySavedState(state, savedState);

        expect(applied).toBe(true);
        expect(state.currentSession).toBe(3);
        expect(state.settings.workDuration).toBe(50);
        expect(state.settings.autoStart).toBe(true);
        expect(state.settings.longBreak).toBe(15);
        expect(Array.isArray(state.tasks)).toBe(true);
        expect(state.tasks).toEqual([]);
        expect(state.uiPreferences).toEqual({ hideCompleted: true });
    });

    it('uses provided task array and recalculates timeLeft from endTime in future', () => {
        vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

        const state = createDefaultState();
        const savedTasks = [{ id: '1', title: 'Task 1' }];
        const savedState = {
            endTime: Date.now() + 1450,
            timeLeft: 99,
            tasks: savedTasks,
            uiPreferences: {},
            settings: {},
        };

        StorageManager.applySavedState(state, savedState);

        expect(state.tasks).toBe(savedTasks);
        expect(state.timeLeft).toBe(2);
    });

    it('recalculates timeLeft as 0 when saved endTime is in the past', () => {
        vi.setSystemTime(new Date('2025-01-01T00:00:05.000Z'));

        const state = createDefaultState();
        const savedState = {
            endTime: Date.now() - 500,
            settings: {},
            uiPreferences: {},
            tasks: [],
        };

        StorageManager.applySavedState(state, savedState);

        expect(state.timeLeft).toBe(0);
    });
});
