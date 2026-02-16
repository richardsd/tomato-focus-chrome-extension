import { ACTIONS } from '../shared/runtimeActions.js';
import { BadgeManager } from './badge.js';
import { ContextMenuManager } from './contextMenus.js';
import { NotificationManager } from './notifications.js';

export class UiNotifier {
    constructor({ saveState } = {}) {
        this.saveState = saveState;
    }

    updateBadge(state) {
        BadgeManager.update(
            state.timeLeft,
            state.isRunning,
            state.isWorkSession
        );
    }

    updateContextMenu(state) {
        void ContextMenuManager.update(
            state.isRunning,
            state.isWorkSession,
            state.timeLeft
        );
    }

    updateUI(state) {
        this.updateBadge(state);
        this.updateContextMenu(state);
        this.sendTimerUpdate(state);
        if (this.saveState) {
            this.saveState();
        }
    }

    sendTimerUpdate(state) {
        this.sendMessage(ACTIONS.UPDATE_TIMER, state.getState());
    }

    sendMessage(action, data) {
        chrome.runtime.sendMessage({ action, state: data }).catch((error) => {
            // Ignore connection errors when no popup is open
            if (!error.message.includes('Receiving end does not exist')) {
                console.warn('Failed to send message to popup:', error.message);
            }
        });
    }

    async notify(title, message, settings) {
        return NotificationManager.show(title, message, settings);
    }
}
