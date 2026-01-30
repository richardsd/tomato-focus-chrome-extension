export const flushPromises = () =>
    new Promise((resolve) => {
        queueMicrotask(resolve);
    });
