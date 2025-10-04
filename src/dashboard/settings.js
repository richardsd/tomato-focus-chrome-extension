import { POPUP_CONSTANTS } from '../popup/common.js';
import { validateSettingsValues } from '../popup/settings.js';

export class DashboardSettingsManager {
    constructor(options = {}) {
        const { container, messenger, onStateUpdate } = options;
        this.container = container;
        this.messenger = messenger;
        this.onStateUpdate = onStateUpdate;

        this.form = this.container?.querySelector('#dashboardSettingsForm');
        this.errorsElement = this.container?.querySelector(
            '#dashboardSettingsErrors'
        );
        this.statusElement = this.container?.querySelector(
            '#dashboardSettingsStatus'
        );
        this.resetButton = this.container?.querySelector(
            '#dashboardResetSettings'
        );

        this.inputs = {
            workDuration: this.container?.querySelector('#dsWorkDuration'),
            shortBreak: this.container?.querySelector('#dsShortBreak'),
            longBreak: this.container?.querySelector('#dsLongBreak'),
            longBreakInterval: this.container?.querySelector(
                '#dsLongBreakInterval'
            ),
            autoStart: this.container?.querySelector('#dsAutoStart'),
            pauseOnIdle: this.container?.querySelector('#dsPauseOnIdle'),
            playSound: this.container?.querySelector('#dsPlaySound'),
            volume: this.container?.querySelector('#dsVolume'),
            theme: this.container?.querySelector('#dsTheme'),
            jiraUrl: this.container?.querySelector('#dsJiraUrl'),
            jiraUsername: this.container?.querySelector('#dsJiraUsername'),
            jiraToken: this.container?.querySelector('#dsJiraToken'),
            autoSyncJira: this.container?.querySelector('#dsAutoSyncJira'),
            jiraSyncInterval: this.container?.querySelector(
                '#dsJiraSyncInterval'
            ),
        };
    }

    init() {
        if (this.form) {
            this.form.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleSubmit();
            });
        }

        if (this.resetButton) {
            this.resetButton.addEventListener('click', () => {
                this.render(POPUP_CONSTANTS.DEFAULT_STATE.settings);
                this.showStatus('Settings reset — save to persist changes.');
            });
        }
    }

    render(settings) {
        const values = {
            ...POPUP_CONSTANTS.DEFAULT_STATE.settings,
            ...(settings || {}),
        };

        Object.entries({
            workDuration: values.workDuration,
            shortBreak: values.shortBreak,
            longBreak: values.longBreak,
            longBreakInterval: values.longBreakInterval,
            volume: values.volume,
            theme: values.theme,
            jiraUrl: values.jiraUrl,
            jiraUsername: values.jiraUsername,
            jiraToken: values.jiraToken,
            jiraSyncInterval: values.jiraSyncInterval,
        }).forEach(([key, value]) => {
            const input = this.inputs[key];
            if (input) {
                input.value = value ?? '';
            }
        });

        ['autoStart', 'pauseOnIdle', 'playSound', 'autoSyncJira'].forEach(
            (key) => {
                const input = this.inputs[key];
                if (input) {
                    input.checked = Boolean(values[key]);
                }
            }
        );

        this.clearMessages();
    }

    async handleSubmit() {
        if (!this.messenger) {
            return;
        }

        const settings = this.collectSettingsFromForm();
        const { isValid, errors } = validateSettingsValues(settings);

        if (!isValid) {
            this.showErrors(errors);
            return;
        }

        this.clearMessages();

        try {
            const state = await this.messenger.sendMessage('saveSettings', {
                settings,
            });
            if (typeof this.onStateUpdate === 'function') {
                this.onStateUpdate(state);
            }
            this.showStatus('Settings saved successfully.');
        } catch (error) {
            console.error('Failed to save settings', error);
            this.showErrors(['Failed to save settings. Please try again.']);
        }
    }

    collectSettingsFromForm() {
        const { inputs } = this;
        return {
            workDuration: parseInt(inputs.workDuration?.value, 10) || 25,
            shortBreak: parseInt(inputs.shortBreak?.value, 10) || 5,
            longBreak: parseInt(inputs.longBreak?.value, 10) || 15,
            longBreakInterval:
                parseInt(inputs.longBreakInterval?.value, 10) || 4,
            autoStart: Boolean(inputs.autoStart?.checked),
            pauseOnIdle: Boolean(inputs.pauseOnIdle?.checked),
            playSound: Boolean(inputs.playSound?.checked),
            volume: Number.parseFloat(inputs.volume?.value) || 1,
            theme: inputs.theme?.value || 'system',
            jiraUrl: inputs.jiraUrl?.value?.trim() || '',
            jiraUsername: inputs.jiraUsername?.value?.trim() || '',
            jiraToken: inputs.jiraToken?.value?.trim() || '',
            autoSyncJira: Boolean(inputs.autoSyncJira?.checked),
            jiraSyncInterval:
                parseInt(inputs.jiraSyncInterval?.value, 10) ||
                POPUP_CONSTANTS.DEFAULT_STATE.settings.jiraSyncInterval,
        };
    }

    showErrors(errors = []) {
        if (!this.errorsElement) {
            return;
        }
        if (!errors.length) {
            this.errorsElement.textContent = '';
            this.errorsElement.classList.add('hidden');
            return;
        }
        this.errorsElement.innerHTML = errors
            .map((error) => `<div>${error}</div>`)
            .join('');
        this.errorsElement.classList.remove('hidden');
    }

    showStatus(message) {
        if (!this.statusElement) {
            return;
        }
        if (!message) {
            this.statusElement.textContent = '';
            this.statusElement.classList.add('hidden');
            return;
        }
        this.statusElement.textContent = message;
        this.statusElement.classList.remove('hidden');
    }

    clearMessages() {
        this.showErrors([]);
        this.showStatus('');
    }
}
