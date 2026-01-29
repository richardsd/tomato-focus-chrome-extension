const DEBUG_LOGGING_STORAGE_KEY = 'tomatoFocusDebug';

// Enable debug logging by running:
// localStorage.setItem('tomatoFocusDebug', 'true') and reloading the popup.
export const isDebugLoggingEnabled = () => {
    try {
        return (
            typeof globalThis !== 'undefined' &&
            globalThis.localStorage?.getItem(DEBUG_LOGGING_STORAGE_KEY) ===
                'true'
        );
    } catch {
        return false;
    }
};

export const createLogger = (scope = '') => {
    const prefix = scope ? `[${scope}]` : '';
    const withPrefix = (args) => (prefix ? [prefix, ...args] : args);

    return {
        debug: (...args) => {
            if (isDebugLoggingEnabled()) {
                console.log(...withPrefix(args));
            }
        },
        info: (...args) => {
            if (isDebugLoggingEnabled()) {
                console.info(...withPrefix(args));
            }
        },
        warn: (...args) => {
            console.warn(...withPrefix(args));
        },
        error: (...args) => {
            console.error(...withPrefix(args));
        },
    };
};
