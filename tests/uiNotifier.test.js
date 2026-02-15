import { describe, expect, it, vi } from 'vitest';

import { UiNotifier } from '../src/background/uiNotifier.js';
import { BadgeManager } from '../src/background/badge.js';
import { ContextMenuManager } from '../src/background/contextMenus.js';
import { ACTIONS } from '../src/shared/runtimeActions.js';

const flushPromises = async () => Promise.resolve();

describe('UiNotifier dependency calls', () => {
    it('updateBadge delegates to BadgeManager.update', () => {
        const notifier = new UiNotifier();
        const state = {
            timeLeft: 120,
            isRunning: true,
            isWorkSession: false,
        };
        const badgeSpy = vi
            .spyOn(BadgeManager, 'update')
            .mockImplementation(() => {});

        notifier.updateBadge(state);

        expect(badgeSpy).toHaveBeenCalledWith(120, true, false);
    });

    it('updateContextMenu delegates to ContextMenuManager.update', () => {
        const notifier = new UiNotifier();
        const state = {
            isRunning: false,
            isWorkSession: true,
            timeLeft: 30,
        };
        const contextSpy = vi
            .spyOn(ContextMenuManager, 'update')
            .mockImplementation(() => {});

        notifier.updateContextMenu(state);

        expect(contextSpy).toHaveBeenCalledWith(false, true, 30);
    });

    it('sendTimerUpdate sends update action with state snapshot', () => {
        const notifier = new UiNotifier();
        const stateSnapshot = { isRunning: true };
        const state = {
            getState: vi.fn(() => stateSnapshot),
        };
        const sendMessageSpy = vi
            .spyOn(notifier, 'sendMessage')
            .mockImplementation(() => {});

        notifier.sendTimerUpdate(state);

        expect(sendMessageSpy).toHaveBeenCalledWith(
            ACTIONS.UPDATE_TIMER,
            stateSnapshot
        );
    });
});

describe('UiNotifier.sendMessage', () => {
    it('ignores "Receiving end does not exist" errors', async () => {
        const notifier = new UiNotifier();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        chrome.runtime.sendMessage.mockReturnValueOnce(
            Promise.reject(
                new Error(
                    'Could not establish connection. Receiving end does not exist.'
                )
            )
        );

        notifier.sendMessage('ACTION', { value: 1 });
        await flushPromises();

        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns on other runtime messaging failures', async () => {
        const notifier = new UiNotifier();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        chrome.runtime.sendMessage.mockReturnValueOnce(
            Promise.reject(new Error('Unexpected failure'))
        );

        notifier.sendMessage('ACTION', { value: 1 });
        await flushPromises();

        expect(warnSpy).toHaveBeenCalledWith(
            'Failed to send message to popup:',
            'Unexpected failure'
        );
    });
});
