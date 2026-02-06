import { afterEach, beforeEach, vi } from 'vitest';

import { installChromeMock } from './utils/chromeMock.js';

beforeEach(() => {
    vi.useFakeTimers({
        toFake: ['setTimeout', 'setInterval', 'Date'],
    });
    installChromeMock();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});
