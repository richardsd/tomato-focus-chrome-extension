import { describe, expect, it, vi } from 'vitest';

import { ContextMenuManager } from '../src/background/contextMenus.js';

describe('ContextMenuManager.create', () => {
    it('registers all context menu items after clearing existing ones', () => {
        ContextMenuManager.create();

        expect(chrome.contextMenus.removeAll).toHaveBeenCalledOnce();

        const removeAllCallback =
            chrome.contextMenus.removeAll.mock.calls[0][0];
        removeAllCallback();

        expect(chrome.contextMenus.create).toHaveBeenCalledTimes(9);
        expect(chrome.contextMenus.create).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                id: 'start-pause',
                title: 'Start Timer',
                contexts: ['action'],
            }),
            expect.any(Function)
        );
        expect(chrome.contextMenus.create).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'quick-25',
                parentId: 'quick-times',
                title: '25 minutes (Focus)',
            }),
            expect.any(Function)
        );
    });

    it('logs create errors reported by chrome.runtime.lastError', () => {
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        ContextMenuManager.create();
        chrome.contextMenus.removeAll.mock.calls[0][0]();

        const createCallback = chrome.contextMenus.create.mock.calls[0][1];
        chrome.runtime.lastError = { message: 'duplicate id' };
        createCallback();

        expect(errorSpy).toHaveBeenCalledWith(
            'Error creating context menu:',
            chrome.runtime.lastError
        );
    });
});

describe('ContextMenuManager.update', () => {
    it('updates start/pause title and skip-break enabled state', () => {
        ContextMenuManager.update(true, true, 60);

        expect(chrome.contextMenus.update).toHaveBeenNthCalledWith(
            1,
            'start-pause',
            { title: 'Pause Timer' },
            expect.any(Function)
        );
        expect(chrome.contextMenus.update).toHaveBeenNthCalledWith(
            2,
            'skip-break',
            { enabled: false },
            expect.any(Function)
        );

        chrome.contextMenus.update.mockClear();

        ContextMenuManager.update(false, false, 30);

        expect(chrome.contextMenus.update).toHaveBeenNthCalledWith(
            1,
            'start-pause',
            { title: 'Start Timer' },
            expect.any(Function)
        );
        expect(chrome.contextMenus.update).toHaveBeenNthCalledWith(
            2,
            'skip-break',
            { enabled: true },
            expect.any(Function)
        );
    });

    it('logs update errors reported by chrome.runtime.lastError', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        ContextMenuManager.update(false, false, 5);

        chrome.runtime.lastError = { message: 'menu not found' };
        const firstUpdateCallback = chrome.contextMenus.update.mock.calls[0][2];
        firstUpdateCallback();

        expect(logSpy).toHaveBeenCalledWith(
            'Context menu not ready yet:',
            'menu not found'
        );
    });
});
