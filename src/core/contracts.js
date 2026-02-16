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
 */

export {};
