/**
 * @typedef {Object} StorageAdapter
 * @property {(keys: string[]|string|Object|null) => Promise<Object>} get
 * @property {(items: Object) => Promise<void>} set
 */

/**
 * @typedef {Object} SchedulerAdapter
 * @property {(name: string, options?: {when?: number, periodInMinutes?: number}) => Promise<void>} create
 * @property {(name: string) => Promise<void>} clear
 * @property {() => Promise<void>} clearAll
 * @property {(listener: (alarm: {name: string}) => void) => void} onAlarm
 */

/**
 * @typedef {Object} IdleProvider
 * @property {(thresholdSeconds: number, callback: (state: string) => void) => void} queryState
 * @property {(listener: (state: string) => void) => void} onStateChanged
 */

/**
 * @typedef {Object} NotificationsAdapter
 * @property {() => Promise<string>} getPermissionLevel
 * @property {(id: string, options: Object) => Promise<string>} create
 * @property {(id: string) => Promise<void>} clear
 */

/**
 * @typedef {Object} ContextMenusAdapter
 * @property {() => Promise<void>} removeAll
 * @property {(item: Object) => Promise<void>} create
 * @property {(id: string, updates: Object) => Promise<void>} update
 * @property {(listener: (info: {menuItemId: string}) => void) => void} onClicked
 */

export {};
