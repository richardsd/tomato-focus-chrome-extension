export class ContextMenuManager {
    static create() {
        chrome.contextMenus.removeAll(() => {
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

            menuItems.forEach((item) => {
                chrome.contextMenus.create(item, () => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            'Error creating context menu:',
                            chrome.runtime.lastError
                        );
                    }
                });
            });
        });
    }

    static update(isRunning, isWorkSession, timeLeft) {
        const startPauseTitle = isRunning ? 'Pause Timer' : 'Start Timer';

        chrome.contextMenus.update(
            'start-pause',
            { title: startPauseTitle },
            () => {
                if (chrome.runtime.lastError) {
                    console.log(
                        'Context menu not ready yet:',
                        chrome.runtime.lastError.message
                    );
                }
            }
        );

        chrome.contextMenus.update(
            'skip-break',
            {
                enabled: !isWorkSession && timeLeft > 0,
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.log(
                        'Context menu not ready yet:',
                        chrome.runtime.lastError.message
                    );
                }
            }
        );
    }
}
