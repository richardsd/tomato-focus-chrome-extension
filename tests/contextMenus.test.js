import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextMenuManager } from '../src/background/contextMenus.js';

describe('ContextMenuManager.create', () => {
    beforeEach(() => {
        // Spy on the adapter methods to track calls
        vi.spyOn(ContextMenuManager.contextMenus, 'removeAll').mockResolvedValue();
        vi.spyOn(ContextMenuManager.contextMenus, 'create').mockResolvedValue();
    });

    it('registers all context menu items after clearing existing ones', async () => {
        await ContextMenuManager.create();

        expect(ContextMenuManager.contextMenus.removeAll).toHaveBeenCalledOnce();
        expect(ContextMenuManager.contextMenus.create).toHaveBeenCalledTimes(9);
        expect(ContextMenuManager.contextMenus.create).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                id: 'start-pause',
                title: 'Start Timer',
                contexts: ['action'],
            })
        );
        expect(ContextMenuManager.contextMenus.create).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'quick-25',
                parentId: 'quick-times',
                title: '25 minutes (Focus)',
            })
        );
    });

    it('logs create errors reported by the adapter', async () => {
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        ContextMenuManager.contextMenus.create
            .mockResolvedValueOnce() // first item succeeds
            .mockRejectedValueOnce(new Error('duplicate id')); // second item fails

        await ContextMenuManager.create();

        expect(errorSpy).toHaveBeenCalledWith(
            'Error creating context menu:',
            expect.objectContaining({ message: 'duplicate id' })
        );
    });
});

describe('ContextMenuManager.update', () => {
    beforeEach(() => {
        // Spy on the adapter methods
        vi.spyOn(ContextMenuManager.contextMenus, 'update').mockResolvedValue();
    });

    it('updates start/pause title and skip-break enabled state', async () => {
        await ContextMenuManager.update(true, true, 60);

        expect(ContextMenuManager.contextMenus.update).toHaveBeenNthCalledWith(
            1,
            'start-pause',
            { title: 'Pause Timer' }
        );
        expect(ContextMenuManager.contextMenus.update).toHaveBeenNthCalledWith(
            2,
            'skip-break',
            { enabled: false }
        );

        ContextMenuManager.contextMenus.update.mockClear();

        await ContextMenuManager.update(false, false, 30);

        expect(ContextMenuManager.contextMenus.update).toHaveBeenNthCalledWith(
            1,
            'start-pause',
            { title: 'Start Timer' }
        );
        expect(ContextMenuManager.contextMenus.update).toHaveBeenNthCalledWith(
            2,
            'skip-break',
            { enabled: true }
        );
    });

    it('logs update errors reported by the adapter', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        ContextMenuManager.contextMenus.update.mockRejectedValueOnce(
            new Error('menu not found')
        );

        await ContextMenuManager.update(false, false, 5);

        expect(logSpy).toHaveBeenCalledWith(
            'Context menu not ready yet:',
            'menu not found'
        );
    });
});
