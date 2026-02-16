/** @import {IdleProvider, SchedulerAdapter, StorageAdapter} from '../../core/contracts.js' */

/** @returns {StorageAdapter} */
export function createChromeStorageAdapter() {
    return {
        get: (keys) =>
            new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
        set: (items) =>
            new Promise((resolve) => chrome.storage.local.set(items, resolve)),
    };
}

/** @returns {SchedulerAdapter} */
export function createChromeSchedulerAdapter() {
    return {
        create: (name, options = {}) =>
            new Promise((resolve) => {
                chrome.alarms.create(name, options);
                resolve();
            }),
        clear: (name) =>
            new Promise((resolve) => {
                chrome.alarms.clear(name, () => resolve());
            }),
        clearAll: () =>
            new Promise((resolve) => {
                chrome.alarms.clearAll(() => resolve());
            }),
    };
}

/** @returns {IdleProvider} */
export function createChromeIdleProvider() {
    return {
        queryState: (thresholdSeconds, callback) =>
            chrome.idle.queryState(thresholdSeconds, callback),
        onStateChanged: (listener) =>
            chrome.idle.onStateChanged.addListener(listener),
    };
}
