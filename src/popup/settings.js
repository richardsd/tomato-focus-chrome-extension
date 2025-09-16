import { POPUP_CONSTANTS, utils } from './common.js';

export class SettingsManager {
    constructor() {
        this.form = this.createFormInterface();
    }

    /**
     * Create settings form interface
     */
    createFormInterface() {
        const inputs = {
            workDuration: document.getElementById('workDuration'),
            shortBreak: document.getElementById('shortBreak'),
            longBreak: document.getElementById('longBreak'),
            longBreakInterval: document.getElementById('longBreakInterval'),
            autoStart: document.getElementById('autoStart'),
            theme: document.getElementById('theme'),
            pauseOnIdle: document.getElementById('pauseOnIdle'),
            playSound: document.getElementById('playSound'),
            volume: document.getElementById('volume'),
            jiraUrl: document.getElementById('jiraUrl'),
            jiraUsername: document.getElementById('jiraUsername'),
            jiraToken: document.getElementById('jiraToken'),
            autoSyncJira: document.getElementById('autoSyncJira'),
            jiraSyncInterval: document.getElementById('jiraSyncInterval')
        };

        return { inputs };
    }

    /**
     * Get current settings from form
     */
    getSettings() {
        const { inputs } = this.form;

        return {
            workDuration: parseInt(inputs.workDuration?.value) || 25,
            shortBreak: parseInt(inputs.shortBreak?.value) || 5,
            longBreak: parseInt(inputs.longBreak?.value) || 15,
            longBreakInterval: parseInt(inputs.longBreakInterval?.value) || 4,
            autoStart: inputs.autoStart?.checked || false,
            theme: inputs.theme?.value || 'system',
            pauseOnIdle: inputs.pauseOnIdle ? inputs.pauseOnIdle.checked : true,
            playSound: inputs.playSound ? inputs.playSound.checked : true,
            volume: parseFloat(inputs.volume?.value) || 1,
            jiraUrl: inputs.jiraUrl?.value?.trim() || '',
            jiraUsername: inputs.jiraUsername?.value?.trim() || '',
            jiraToken: inputs.jiraToken?.value?.trim() || '',
            autoSyncJira: inputs.autoSyncJira?.checked || false,
            jiraSyncInterval: parseInt(inputs.jiraSyncInterval?.value, 10)
                || POPUP_CONSTANTS.DEFAULT_STATE.settings.jiraSyncInterval
        };
    }

    /**
     * Validate settings values
     */
    validateSettings(settings) {
        const errors = [];

        if (settings.workDuration < 1 || settings.workDuration > 60) {
            errors.push('Work duration must be between 1 and 60 minutes');
        }
        if (settings.shortBreak < 1 || settings.shortBreak > 30) {
            errors.push('Short break must be between 1 and 30 minutes');
        }
        if (settings.longBreak < 1 || settings.longBreak > 60) {
            errors.push('Long break must be between 1 and 60 minutes');
        }
        if (settings.longBreakInterval < 1 || settings.longBreakInterval > 10) {
            errors.push('Sessions before long break must be between 1 and 10');
        }

        if (settings.volume < 0 || settings.volume > 1) {
            errors.push('Volume must be between 0 and 1');
        }

        const hasAnyJira = settings.jiraUrl || settings.jiraUsername || settings.jiraToken;
        const hasAllJira = settings.jiraUrl && settings.jiraUsername && settings.jiraToken;
        if (hasAnyJira && !hasAllJira) {
            errors.push('Jira URL, username, and token are all required for Jira integration');
        }

        if (settings.autoSyncJira && !hasAllJira) {
            errors.push('Enable periodic sync only after entering Jira URL, username, and token');
        }

        if (!Number.isFinite(settings.jiraSyncInterval) || settings.jiraSyncInterval < 5 || settings.jiraSyncInterval > 720) {
            errors.push('Sync interval must be between 5 and 720 minutes');
        }

        return { isValid: errors.length === 0, errors };
    }
}

/**
 * Manages panel navigation
 */
