import { CONSTANTS } from './constants.js';
import { createChromeStorageAdapter } from './adapters/chromeAdapters.js';
import {
    DEFAULT_SETTINGS,
    createDefaultState,
} from '../shared/stateDefaults.js';

export class StorageManager {
    static storage = createChromeStorageAdapter();
    static async saveState(state) {
        try {
            await this.storage.set({
                [CONSTANTS.STORAGE_KEY]: state,
            });
        } catch (error) {
            console.error('Failed to save state:', error);
        }
    }

    static async loadState() {
        try {
            const result = await this.storage.get([CONSTANTS.STORAGE_KEY]);
            return result[CONSTANTS.STORAGE_KEY] || null;
        } catch (error) {
            console.error('Failed to load state:', error);
            return null;
        }
    }

    static applySavedState(state, savedState) {
        const defaultState = createDefaultState();

        if (savedState) {
            Object.assign(state, defaultState, savedState);
            state.settings = {
                ...DEFAULT_SETTINGS,
                ...(savedState.settings || {}),
            };
            state.tasks = Array.isArray(savedState.tasks)
                ? savedState.tasks
                : defaultState.tasks;
            state.uiPreferences = {
                ...defaultState.uiPreferences,
                ...(savedState.uiPreferences || {}),
            };
            if (savedState.endTime) {
                const remainingMs = savedState.endTime - Date.now();
                state.timeLeft = Math.max(0, Math.ceil(remainingMs / 1000));
            }
            return true;
        }

        Object.assign(state, defaultState);
        return false;
    }
}
