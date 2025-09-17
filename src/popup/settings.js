import { POPUP_CONSTANTS } from './common.js';

export class SettingsManager {
    constructor() {
        this.form = this.createFormInterface();
        this.currentSettings = { ...POPUP_CONSTANTS.DEFAULT_STATE.settings };
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
            autoSyncJira: document.getElementById('autoSyncJira'),
            jiraSyncInterval: document.getElementById('jiraSyncInterval')
        };

        const elements = {
            jiraConnectBtn: document.getElementById('jiraConnectBtn'),
            jiraDisconnectBtn: document.getElementById('jiraDisconnectBtn'),
            jiraConnectionStatus: document.getElementById('jiraConnectionStatus'),
            jiraConnectionDetails: document.getElementById('jiraConnectionDetails'),
            syncJiraBtn: document.getElementById('syncJiraBtn')
        };

        return { inputs, elements };
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
            jiraUrl: this.currentSettings?.jiraUrl || '',
            jiraCloudId: this.currentSettings?.jiraCloudId || '',
            jiraSiteName: this.currentSettings?.jiraSiteName || '',
            jiraAccount: this.currentSettings?.jiraAccount || null,
            jiraOAuth: this.currentSettings?.jiraOAuth || null,
            autoSyncJira: this.hasActiveJiraSession() ? (inputs.autoSyncJira?.checked || false) : false,
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

        if (settings.autoSyncJira && !this.hasActiveJiraSession()) {
            errors.push('Connect to Jira before enabling periodic sync.');
        }

        if (!Number.isFinite(settings.jiraSyncInterval) || settings.jiraSyncInterval < 5 || settings.jiraSyncInterval > 720) {
            errors.push('Sync interval must be between 5 and 720 minutes');
        }

        return { isValid: errors.length === 0, errors };
    }

    hasActiveJiraSession() {
        const auth = this.currentSettings?.jiraOAuth;
        return Boolean(this.currentSettings?.jiraCloudId && auth && (auth.refreshToken || auth.accessToken));
    }

    syncSettings(settings = {}) {
        this.currentSettings = {
            ...POPUP_CONSTANTS.DEFAULT_STATE.settings,
            ...(settings || {})
        };
        this.updateJiraStatus();
    }

    updateJiraStatus() {
        const { inputs, elements } = this.form;
        const isConnected = this.hasActiveJiraSession();

        if (inputs.autoSyncJira) {
            inputs.autoSyncJira.disabled = !isConnected;
            if (!isConnected) {
                inputs.autoSyncJira.checked = false;
            }
        }

        if (elements.syncJiraBtn) {
            elements.syncJiraBtn.disabled = !isConnected;
        }

        const statusEl = elements.jiraConnectionStatus;
        const detailsEl = elements.jiraConnectionDetails;
        const connectBtn = elements.jiraConnectBtn;
        const disconnectBtn = elements.jiraDisconnectBtn;

        if (isConnected) {
            const account = this.currentSettings.jiraAccount || {};
            if (statusEl) {
                statusEl.textContent = account.name ? `Connected as ${account.name}` : 'Connected to Jira';
            }

            if (detailsEl) {
                const siteName = this.currentSettings.jiraSiteName || '';
                const siteUrl = this.currentSettings.jiraUrl || '';
                const parts = [];
                if (siteName) parts.push(siteName);
                if (siteUrl) parts.push(siteUrl);
                detailsEl.textContent = parts.join(' • ');
                detailsEl.classList.toggle('hidden', parts.length === 0);
            }

            if (connectBtn) {
                connectBtn.classList.add('hidden');
                connectBtn.disabled = false;
            }
            if (disconnectBtn) {
                disconnectBtn.classList.remove('hidden');
                disconnectBtn.disabled = false;
            }
        } else {
            if (statusEl) {
                statusEl.textContent = 'Not connected';
            }
            if (detailsEl) {
                detailsEl.textContent = 'Connect to Jira to import tasks and enable syncing.';
                detailsEl.classList.remove('hidden');
            }
            if (connectBtn) {
                connectBtn.classList.remove('hidden');
                connectBtn.disabled = false;
            }
            if (disconnectBtn) {
                disconnectBtn.classList.add('hidden');
                disconnectBtn.disabled = false;
            }
        }
    }

    setJiraLoading(isLoading) {
        const { elements } = this.form;
        const statusEl = elements.jiraConnectionStatus;
        [elements.jiraConnectBtn, elements.jiraDisconnectBtn].forEach((btn) => {
            if (btn) {
                btn.disabled = Boolean(isLoading);
            }
        });

        if (isLoading && statusEl) {
            statusEl.textContent = 'Authorizing with Jira…';
        }

        if (!isLoading) {
            this.updateJiraStatus();
        }
    }
}

/**
 * Manages panel navigation
 */
