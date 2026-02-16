import { vi } from 'vitest';

const createStorageArea = (initialData = {}) => {
    let data = { ...initialData };

    return {
        get: vi.fn((keys, callback) => {
            let result = {};

            if (Array.isArray(keys)) {
                keys.forEach((key) => {
                    if (key in data) {
                        result[key] = data[key];
                    }
                });
            } else if (typeof keys === 'string') {
                if (keys in data) {
                    result[keys] = data[keys];
                }
            } else if (typeof keys === 'object' && keys !== null) {
                Object.keys(keys).forEach((key) => {
                    result[key] = key in data ? data[key] : keys[key];
                });
            } else {
                result = { ...data };
            }

            callback?.(result);
        }),
        set: vi.fn((items, callback) => {
            data = { ...data, ...items };
            callback?.();
        }),
        remove: vi.fn((keys, callback) => {
            const keyList = Array.isArray(keys) ? keys : [keys];
            keyList.forEach((key) => {
                delete data[key];
            });
            callback?.();
        }),
        clear: vi.fn((callback) => {
            data = {};
            callback?.();
        }),
        _getData: () => ({ ...data }),
    };
};

export const createChromeMock = (overrides = {}) => {
    const storageLocal = createStorageArea();

    return {
        runtime: {
            lastError: null,
            getContexts: vi.fn(() => []),
            getURL: vi.fn((path = '') => `chrome-extension://mock/${path}`),
            sendMessage: vi.fn(),
            onMessage: {
                addListener: vi.fn(),
                removeListener: vi.fn(),
            },
        },
        alarms: {
            create: vi.fn(),
            clear: vi.fn(),
            onAlarm: {
                addListener: vi.fn(),
                removeListener: vi.fn(),
            },
        },
        storage: {
            local: storageLocal,
        },
        notifications: {
            create: vi.fn((id, options, callback) => {
                callback?.(id);
            }),
            clear: vi.fn((id, callback) => {
                callback?.();
            }),
            getPermissionLevel: vi.fn((callback) => {
                callback?.('granted');
            }),
            onClicked: {
                addListener: vi.fn(),
                removeListener: vi.fn(),
            },
            onClosed: {
                addListener: vi.fn(),
                removeListener: vi.fn(),
            },
        },
        action: {
            setBadgeText: vi.fn(),
            setBadgeBackgroundColor: vi.fn(),
            setIcon: vi.fn(),
            onClicked: {
                addListener: vi.fn(),
                removeListener: vi.fn(),
            },
        },
        contextMenus: {
            create: vi.fn((item, callback) => {
                callback?.();
            }),
            removeAll: vi.fn((callback) => {
                callback?.();
            }),
            update: vi.fn((id, updates, callback) => {
                callback?.();
            }),
            onClicked: {
                addListener: vi.fn(),
                removeListener: vi.fn(),
            },
        },
        idle: {
            queryState: vi.fn((threshold, callback) => {
                callback?.('active');
            }),
            setDetectionInterval: vi.fn(),
        },
        offscreen: {
            createDocument: vi.fn(),
            closeDocument: vi.fn(),
            hasDocument: vi.fn((callback) => {
                callback?.(false);
            }),
        },
        ...overrides,
    };
};

export const createChromePromise = (chromeInstance) => ({
    storage: {
        local: {
            get: (keys) =>
                new Promise((resolve) =>
                    chromeInstance.storage.local.get(keys, resolve)
                ),
            set: (items) =>
                new Promise((resolve) =>
                    chromeInstance.storage.local.set(items, resolve)
                ),
        },
    },
    notifications: {
        getPermissionLevel: () =>
            new Promise((resolve) =>
                chromeInstance.notifications.getPermissionLevel(resolve)
            ),
        create: (id, options) =>
            new Promise((resolve, reject) => {
                chromeInstance.notifications.create(
                    id,
                    options,
                    (notificationId) => {
                        if (chromeInstance.runtime.lastError) {
                            reject(
                                new Error(
                                    chromeInstance.runtime.lastError.message
                                )
                            );
                        } else {
                            resolve(notificationId);
                        }
                    }
                );
            }),
    },
});

export const installChromeMock = (overrides = {}) => {
    const chromeInstance = createChromeMock(overrides);
    globalThis.chrome = chromeInstance;
    globalThis.chromePromise = createChromePromise(chromeInstance);
    return chromeInstance;
};
