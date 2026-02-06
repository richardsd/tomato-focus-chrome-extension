import { describe, expect, it } from 'vitest';

import { flushPromises } from './utils/testUtils.js';

describe('test harness sanity check', () => {
    it('provides a chrome mock and utilities', async () => {
        expect(globalThis.chrome).toBeDefined();
        expect(globalThis.chrome.runtime.getContexts).toBeTypeOf('function');
        expect(globalThis.chrome.runtime.getURL).toBeTypeOf('function');

        await flushPromises();
    });
});
