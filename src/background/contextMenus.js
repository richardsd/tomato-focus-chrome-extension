import { createChromeContextMenusAdapter } from './adapters/chromeAdapters.js';

export class ContextMenuManager {
    static contextMenus = createChromeContextMenusAdapter();

    static async create() {
        await this.contextMenus.removeAll();

        const menuItems = [
            {
                id: 'start-pause',
                title: 'Start Timer',
                contexts: ['action'],
            },
            {
                id: 'reset',
                title: 'Reset Timer',
                contexts: ['action'],
            },
            {
                id: 'skip-break',
                title: 'Skip Break',
                contexts: ['action'],
                enabled: false,
            },
            {
                id: 'separator1',
                type: 'separator',
                contexts: ['action'],
            },
            {
                id: 'quick-times',
                title: 'Quick Start',
                contexts: ['action'],
            },
            {
                id: 'quick-5',
                parentId: 'quick-times',
                title: '5 minutes',
                contexts: ['action'],
            },
            {
                id: 'quick-15',
                parentId: 'quick-times',
                title: '15 minutes',
                contexts: ['action'],
            },
            {
                id: 'quick-25',
                parentId: 'quick-times',
                title: '25 minutes (Focus)',
                contexts: ['action'],
            },
            {
                id: 'quick-45',
                parentId: 'quick-times',
                title: '45 minutes',
                contexts: ['action'],
            },
        ];

        for (const item of menuItems) {
            try {
                await this.contextMenus.create(item);
            } catch (error) {
                console.error('Error creating context menu:', error);
            }
        }
    }

    static async update(isRunning, isWorkSession, timeLeft) {
        const startPauseTitle = isRunning ? 'Pause Timer' : 'Start Timer';

        try {
            await this.contextMenus.update('start-pause', {
                title: startPauseTitle,
            });
        } catch (error) {
            console.log('Context menu not ready yet:', error.message);
        }

        try {
            await this.contextMenus.update('skip-break', {
                enabled: !isWorkSession && timeLeft > 0,
            });
        } catch (error) {
            console.log('Context menu not ready yet:', error.message);
        }
    }
}
