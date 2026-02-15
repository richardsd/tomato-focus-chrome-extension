import { describe, expect, it, vi } from 'vitest';

import {
    RuntimeMessenger,
    addRuntimeActionListener,
    addRuntimeMessageListener,
} from '../src/shared/runtimeMessaging.js';
import { flushPromises } from './utils/testUtils.js';

const advanceTimers = async (ms = 0) => {
    vi.advanceTimersByTime(ms);
    await flushPromises();
};

describe('RuntimeMessenger.sendMessage', () => {
    it('rejects when action is missing', async () => {
        const messenger = new RuntimeMessenger();

        await expect(messenger.sendMessage()).rejects.toThrow(
            'Action is required for runtime messaging'
        );
    });

    it('retries once on runtime lastError', async () => {
        const messenger = new RuntimeMessenger({ retryDelay: 50 });
        let callCount = 0;

        chrome.runtime.sendMessage.mockImplementation((payload, callback) => {
            if (callCount === 0) {
                callCount += 1;
                chrome.runtime.lastError = { message: 'disconnected' };
                callback();
                chrome.runtime.lastError = null;
                return;
            }

            callCount += 1;
            chrome.runtime.lastError = null;
            callback({ state: 'ok' });
        });

        const responsePromise = messenger.sendMessage('PING');

        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);

        await advanceTimers(50);

        await expect(responsePromise).resolves.toBe('ok');
        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('falls back to a configured value when retry fails', async () => {
        const messenger = new RuntimeMessenger({
            retryDelay: 25,
            fallbacks: { PING: 'fallback' },
        });

        chrome.runtime.sendMessage.mockImplementation((payload, callback) => {
            chrome.runtime.lastError = { message: 'disconnected' };
            callback();
        });

        const responsePromise = messenger.sendMessage('PING');

        await advanceTimers(25);

        await expect(responsePromise).resolves.toBe('fallback');
        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('rejects when retry fails without a fallback', async () => {
        const messenger = new RuntimeMessenger({ retryDelay: 10 });

        chrome.runtime.sendMessage.mockImplementation((payload, callback) => {
            chrome.runtime.lastError = { message: 'disconnected' };
            callback();
        });

        const responsePromise = messenger.sendMessage('PING');

        await advanceTimers(10);

        await expect(responsePromise).rejects.toThrow('disconnected');
        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('unwraps state by default', async () => {
        const messenger = new RuntimeMessenger();

        chrome.runtime.sendMessage.mockImplementation((payload, callback) => {
            chrome.runtime.lastError = null;
            callback({ state: { running: true } });
        });

        await expect(messenger.sendMessage('PING')).resolves.toEqual({
            running: true,
        });
    });

    it('respects unwrapState: false', async () => {
        const messenger = new RuntimeMessenger({ unwrapState: false });

        chrome.runtime.sendMessage.mockImplementation((payload, callback) => {
            chrome.runtime.lastError = null;
            callback({ state: { running: true } });
        });

        await expect(messenger.sendMessage('PING')).resolves.toEqual({
            state: { running: true },
        });
    });
});

describe('runtime listener helpers', () => {
    it('registers and unregisters raw runtime message listeners', () => {
        const handler = vi.fn();

        const unsubscribe = addRuntimeMessageListener(handler);

        expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(
            handler
        );

        unsubscribe();

        expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(
            handler
        );
    });

    it('filters runtime messages by action and unregisters', () => {
        const handler = vi.fn();

        const unsubscribe = addRuntimeActionListener('PING', handler);
        const wrappedHandler =
            chrome.runtime.onMessage.addListener.mock.calls[0][0];

        wrappedHandler({ action: 'PING', payload: true }, {}, vi.fn());
        wrappedHandler({ action: 'OTHER', payload: false }, {}, vi.fn());

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
            { action: 'PING', payload: true },
            {},
            expect.any(Function)
        );

        unsubscribe();

        expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(
            wrappedHandler
        );
    });
});
