import { ACTIONS } from './runtimeActions.js';

const DEFAULT_RETRY_DELAY = 100;

/**
 * Shared runtime messaging helper that adds retry support and response unwrapping
 * for Chrome extension messaging between UI surfaces and the background service worker.
 */
export class RuntimeMessenger {
    /**
     * @param {Object} [options]
     * @param {number} [options.retryDelay]
     * @param {Record<string, any>} [options.fallbacks]
     * @param {boolean} [options.unwrapState]
     */
    constructor(options = {}) {
        const { retryDelay, fallbacks, unwrapState } = options;
        this.retryDelay = Number.isFinite(retryDelay)
            ? retryDelay
            : DEFAULT_RETRY_DELAY;
        this.fallbacks = fallbacks || {};
        this.unwrapState = unwrapState !== false;
    }

    /**
     * Send a message to the background service worker with retry logic and optional
     * fallback value handling.
     *
     * @template T
     * @param {string} action
     * @param {Record<string, any>} [data]
     * @param {Object} [options]
     * @param {number} [options.retryDelay]
     * @param {T} [options.fallbackValue]
     * @returns {Promise<T|any>}
     */
    async sendMessage(action, data = {}, options = {}) {
        if (!action) {
            return Promise.reject(
                new Error('Action is required for runtime messaging')
            );
        }

        const payload = { action, ...data };
        const retryDelay = Number.isFinite(options.retryDelay)
            ? options.retryDelay
            : this.retryDelay;
        const fallbackValue =
            options &&
            Object.prototype.hasOwnProperty.call(options, 'fallbackValue')
                ? options.fallbackValue
                : this.fallbacks[action];

        return new Promise((resolve, reject) => {
            const attemptSend = (attempt = 0) => {
                chrome.runtime.sendMessage(payload, (response) => {
                    const lastError = chrome.runtime.lastError;

                    if (lastError) {
                        if (attempt === 0) {
                            setTimeout(
                                () => attemptSend(attempt + 1),
                                retryDelay
                            );
                            return;
                        }

                        if (fallbackValue !== undefined) {
                            console.warn(
                                `Runtime message "${action}" failed after retry. Using fallback value.`,
                                lastError.message
                            );
                            resolve(fallbackValue);
                            return;
                        }

                        reject(new Error(lastError.message));
                        return;
                    }

                    if (response && response.error) {
                        reject(new Error(response.error));
                        return;
                    }

                    if (this.unwrapState && response && 'state' in response) {
                        resolve(response.state);
                        return;
                    }

                    resolve(response);
                });
            };

            attemptSend();
        });
    }

    getState(options) {
        return this.sendMessage(ACTIONS.GET_STATE, {}, options);
    }

    saveSettings(settings, options) {
        return this.sendMessage(ACTIONS.SAVE_SETTINGS, { settings }, options);
    }

    updateUiPreferences(uiPreferences, options) {
        return this.sendMessage(
            ACTIONS.UPDATE_UI_PREFERENCES,
            { uiPreferences },
            options
        );
    }

    toggleTimer(options) {
        return this.sendMessage(ACTIONS.TOGGLE_TIMER, {}, options);
    }

    resetTimer(options) {
        return this.sendMessage(ACTIONS.RESET_TIMER, {}, options);
    }

    skipBreak(options) {
        return this.sendMessage(ACTIONS.SKIP_BREAK, {}, options);
    }

    checkNotifications(options) {
        return this.sendMessage(ACTIONS.CHECK_NOTIFICATIONS, {}, options);
    }

    getStatisticsHistory(options) {
        return this.sendMessage(ACTIONS.GET_STATISTICS_HISTORY, {}, options);
    }

    clearStatistics(options) {
        return this.sendMessage(ACTIONS.CLEAR_STATISTICS, {}, options);
    }

    getTasks(options) {
        return this.sendMessage(ACTIONS.GET_TASKS, {}, options);
    }

    createTask(task, options) {
        return this.sendMessage(ACTIONS.CREATE_TASK, { task }, options);
    }

    updateTask(taskId, updates, options) {
        return this.sendMessage(
            ACTIONS.UPDATE_TASK,
            { taskId, updates },
            options
        );
    }

    deleteTask(taskId, options) {
        return this.sendMessage(ACTIONS.DELETE_TASK, { taskId }, options);
    }

    completeTasks(taskIds, options) {
        return this.sendMessage(ACTIONS.COMPLETE_TASKS, { taskIds }, options);
    }

    deleteTasks(taskIds, options) {
        return this.sendMessage(ACTIONS.DELETE_TASKS, { taskIds }, options);
    }

    setCurrentTask(taskId, options) {
        return this.sendMessage(ACTIONS.SET_CURRENT_TASK, { taskId }, options);
    }

    reconfigureJiraSync(options) {
        return this.sendMessage(ACTIONS.RECONFIGURE_JIRA_SYNC, {}, options);
    }

    importJiraTasks(options) {
        return this.sendMessage(ACTIONS.IMPORT_JIRA_TASKS, {}, options);
    }
}

/**
 * Register a raw runtime message listener and return an unsubscribe callback.
 *
 * @param {(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => void} handler
 * @returns {() => void}
 */
export function addRuntimeMessageListener(handler) {
    if (typeof handler !== 'function') {
        return () => {};
    }

    chrome.runtime.onMessage.addListener(handler);
    return () => {
        chrome.runtime.onMessage.removeListener(handler);
    };
}

/**
 * Convenience helper to listen for a specific action dispatched via chrome.runtime.sendMessage.
 *
 * @param {string} action
 * @param {(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => void} handler
 * @returns {() => void}
 */
export function addRuntimeActionListener(action, handler) {
    if (!action || typeof handler !== 'function') {
        return () => {};
    }

    const wrappedHandler = (request, sender, sendResponse) => {
        if (request && request.action === action) {
            handler(request, sender, sendResponse);
        }
    };

    chrome.runtime.onMessage.addListener(wrappedHandler);
    return () => {
        chrome.runtime.onMessage.removeListener(wrappedHandler);
    };
}
