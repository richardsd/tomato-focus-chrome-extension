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
            volume: document.getElementById('volume')
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
            volume: parseFloat(inputs.volume?.value) || 1
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

        return { isValid: errors.length === 0, errors };
    }
}

/**
 * Manages panel navigation
 */
