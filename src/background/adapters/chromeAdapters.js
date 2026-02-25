/** @import {ContextMenusAdapter, IdleProvider, NotificationsAdapter, SchedulerAdapter, StorageAdapter} from '../../core/contracts.js' */

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
        onAlarm: (listener) => chrome.alarms.onAlarm.addListener(listener),
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

/** @returns {NotificationsAdapter} */
export function createChromeNotificationsAdapter() {
    return {
        getPermissionLevel: () =>
            new Promise((resolve) =>
                chrome.notifications.getPermissionLevel(resolve)
            ),
        create: (id, options) =>
            new Promise((resolve, reject) => {
                chrome.notifications.create(id, options, (notificationId) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(notificationId);
                });
            }),
        clear: (id) =>
            new Promise((resolve) => {
                chrome.notifications.clear(id, () => resolve());
            }),
    };
}

/** @returns {ContextMenusAdapter} */
export function createChromeContextMenusAdapter() {
    return {
        removeAll: () =>
            new Promise((resolve) => {
                chrome.contextMenus.removeAll(() => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            'Error removing context menus:',
                            chrome.runtime.lastError
                        );
                    }
                    resolve();
                });
            }),
        create: (item) =>
            new Promise((resolve, reject) => {
                chrome.contextMenus.create(item, () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve();
                });
            }),
        update: (id, updates) =>
            new Promise((resolve, reject) => {
                chrome.contextMenus.update(id, updates, () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve();
                });
            }),
        onClicked: (listener) =>
            chrome.contextMenus.onClicked.addListener(listener),
    };
}
