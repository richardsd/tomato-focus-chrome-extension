import { POPUP_CONSTANTS } from '../popup/common.js';
import { validateSettingsValues } from '../popup/settings.js';
import { isValidJiraUrl, validateJiraUrl } from '../shared/jiraUrlValidator.js';

const TOKEN_PLACEHOLDER = '••••••••••';

function clamp(value, { min, max }) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}

function getJiraPermissionOrigin(jiraUrl) {
    if (!jiraUrl) {
        return null;
    }
    try {
        const parsed = new window.URL(jiraUrl);
        return `${parsed.origin}/*`;
    } catch (error) {
        console.warn('Unable to parse Jira URL for permissions:', error);
        return null;
    }
}

async function requestJiraPermission(settings) {
    if (!settings?.jiraUrl || !settings?.jiraUsername || !settings?.jiraToken) {
        return true;
    }
    const origin = getJiraPermissionOrigin(settings.jiraUrl);
    if (!origin) {
        return false;
    }
    const hasPermission = await chrome.permissions.contains({
        origins: [origin],
    });
    if (hasPermission) {
        return true;
    }
    return chrome.permissions.request({ origins: [origin] });
}

export class DashboardSettingsManager {
    constructor(options = {}) {
        const { container, messenger, onStateUpdate, toastManager } = options;
        this.container = container;
        this.messenger = messenger;
        this.onStateUpdate = onStateUpdate;
        this.toastManager = toastManager;

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

        this.copyTokenButton = this.container?.querySelector(
            '#dashboardCopyJiraToken'
        );
        this.pasteTokenButton = this.container?.querySelector(
            '#dashboardPasteJiraToken'
        );
        this.volumeValue = this.container?.querySelector('#dsVolumeValue');

        this.fieldContainers = {};
        this.container
            ?.querySelectorAll('.settings-field[data-field]')
            .forEach((element) => {
                const key = element.dataset.field;
                if (key) {
                    this.fieldContainers[key] = element;
                }
            });

        this.tokenSecret = '';
    }

    init() {
        if (this.form) {
            this.form.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleSubmit();
            });

            this.form
                .querySelectorAll('.input-stepper__btn')
                .forEach((button) => {
                    button.addEventListener('click', () => {
                        this.handleStepper(button);
                    });
                });
        }

        if (this.resetButton) {
            this.resetButton.addEventListener('click', () => {
                this.render(POPUP_CONSTANTS.DEFAULT_STATE.settings);
                this.showStatus('Settings reset — save to persist changes.');
            });
        }

        if (this.inputs.volume) {
            this.inputs.volume.addEventListener('input', () => {
                this.updateVolumeDisplay();
            });
        }

        if (this.inputs.jiraUrl) {
            this.inputs.jiraUrl.addEventListener('input', () => {
                this.toggleJiraDependentFields();
            });
        }

        if (this.copyTokenButton) {
            this.copyTokenButton.addEventListener('click', () => {
                this.handleCopyToken();
            });
        }

        if (this.pasteTokenButton) {
            this.pasteTokenButton.addEventListener('click', () => {
                this.handlePasteToken();
            });
        }
    }

    render(settings) {
        const values = {
            ...POPUP_CONSTANTS.DEFAULT_STATE.settings,
            ...(settings || {}),
        };

        this.tokenSecret = values.jiraToken || '';

        Object.entries({
            workDuration: values.workDuration,
            shortBreak: values.shortBreak,
            longBreak: values.longBreak,
            longBreakInterval: values.longBreakInterval,
            volume: values.volume,
            theme: values.theme,
            jiraUrl: values.jiraUrl,
            jiraUsername: values.jiraUsername,
            jiraSyncInterval: values.jiraSyncInterval,
        }).forEach(([key, value]) => {
            const input = this.inputs[key];
            if (!input) {
                return;
            }
            if (input.type === 'number') {
                input.value = value ?? '';
            } else {
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

        const tokenInput = this.inputs.jiraToken;
        if (tokenInput) {
            if (this.tokenSecret) {
                tokenInput.value = TOKEN_PLACEHOLDER;
                tokenInput.dataset.placeholder = 'true';
            } else {
                tokenInput.value = '';
                delete tokenInput.dataset.placeholder;
            }
        }

        this.updateVolumeDisplay();
        this.toggleJiraDependentFields();
        this.updateTokenControls();
        this.clearMessages();
    }

    updateVolumeDisplay() {
        if (this.inputs.volume && this.volumeValue) {
            const value = Number.parseFloat(this.inputs.volume.value || '0');
            this.volumeValue.textContent = `${Math.round(value * 100)}%`;
        }
    }

    handleStepper(button) {
        const step = Number.parseInt(button.dataset.step || '0', 10);
        const targetId = button.dataset.target;
        if (!Number.isFinite(step) || !targetId) {
            return;
        }
        const element = document.getElementById(targetId);
        if (!element) {
            return;
        }
        const min = Number.parseInt(element.min || '0', 10) || 0;
        const max = Number.parseInt(element.max || '9999', 10) || 9999;
        const current = Number.parseInt(element.value || '0', 10) || min;
        const next = clamp(current + step, { min, max });
        element.value = String(next);
        element.dispatchEvent(new window.Event('input', { bubbles: true }));
    }

    toggleJiraDependentFields() {
        const jiraUrl = this.inputs.jiraUrl?.value?.trim() || '';
        const isValid = isValidJiraUrl(jiraUrl);
        [
            'jiraUsername',
            'jiraToken',
            'autoSyncJira',
            'jiraSyncInterval',
        ].forEach((key) => {
            const input = this.inputs[key];
            if (input) {
                input.disabled = !isValid;
                if (!isValid) {
                    if (input.type === 'checkbox') {
                        input.checked = false;
                    } else if (key === 'jiraToken') {
                        input.value = '';
                        delete input.dataset.placeholder;
                    }
                }
                if (isValid && key === 'jiraToken') {
                    if (this.tokenSecret) {
                        input.value = TOKEN_PLACEHOLDER;
                        input.dataset.placeholder = 'true';
                    }
                }
            }
        });
        this.updateTokenControls();
    }

    updateTokenControls() {
        const hasToken = Boolean(this.tokenSecret);
        const jiraUrl = this.inputs.jiraUrl?.value?.trim() || '';
        const enabled = isValidJiraUrl(jiraUrl);
        if (this.copyTokenButton) {
            this.copyTokenButton.disabled = !hasToken || !enabled;
        }
        if (this.pasteTokenButton) {
            this.pasteTokenButton.disabled = !enabled;
        }
    }

    collectSettingsFromForm() {
        const { inputs } = this;
        const rawToken = inputs.jiraToken?.value?.trim() || '';
        const shouldKeepSecret =
            rawToken === TOKEN_PLACEHOLDER &&
            Boolean(inputs.jiraToken?.dataset.placeholder);
        const jiraTokenValue = shouldKeepSecret ? this.tokenSecret : rawToken;

        if (!shouldKeepSecret) {
            this.tokenSecret = jiraTokenValue;
        }

        const parsedVolume = Number.parseFloat(inputs.volume?.value);

        return {
            workDuration: parseInt(inputs.workDuration?.value, 10) || 25,
            shortBreak: parseInt(inputs.shortBreak?.value, 10) || 5,
            longBreak: parseInt(inputs.longBreak?.value, 10) || 15,
            longBreakInterval:
                parseInt(inputs.longBreakInterval?.value, 10) || 4,
            autoStart: Boolean(inputs.autoStart?.checked),
            pauseOnIdle: Boolean(inputs.pauseOnIdle?.checked),
            playSound: Boolean(inputs.playSound?.checked),
            volume: Number.isFinite(parsedVolume)
                ? parsedVolume
                : POPUP_CONSTANTS.DEFAULT_STATE.settings.volume,
            theme: inputs.theme?.value || 'system',
            jiraUrl: inputs.jiraUrl?.value?.trim() || '',
            jiraUsername: inputs.jiraUsername?.value?.trim() || '',
            jiraToken: jiraTokenValue,
            autoSyncJira: Boolean(inputs.autoSyncJira?.checked),
            jiraSyncInterval:
                parseInt(inputs.jiraSyncInterval?.value, 10) ||
                POPUP_CONSTANTS.DEFAULT_STATE.settings.jiraSyncInterval,
        };
    }

    validate(settings) {
        const fieldErrors = {};
        const messages = [];

        if (settings.workDuration < 5 || settings.workDuration > 90) {
            fieldErrors.workDuration =
                'Focus length must be between 5 and 90 minutes';
        }
        if (settings.shortBreak < 1 || settings.shortBreak > 30) {
            fieldErrors.shortBreak =
                'Short break must be between 1 and 30 minutes';
        }
        if (settings.longBreak < settings.shortBreak) {
            fieldErrors.longBreak =
                'Long break should be at least as long as the short break';
        } else if (settings.longBreak < 5 || settings.longBreak > 90) {
            fieldErrors.longBreak =
                'Long break must be between 5 and 90 minutes';
        }
        if (settings.longBreakInterval < 1 || settings.longBreakInterval > 12) {
            fieldErrors.longBreakInterval =
                'Sessions before a long break must be between 1 and 12';
        }
        if (settings.volume < 0 || settings.volume > 1) {
            fieldErrors.volume = 'Volume must be between 0 and 100%';
        }

        if (settings.jiraUrl) {
            const { isValid, message } = validateJiraUrl(settings.jiraUrl);
            if (!isValid) {
                fieldErrors.jiraUrl = message;
            }
        }

        const baseValidation = validateSettingsValues(settings);
        if (!baseValidation.isValid) {
            messages.push(...baseValidation.errors);
        }

        const isValid =
            Object.keys(fieldErrors).length === 0 && messages.length === 0;
        return { isValid, fieldErrors, messages };
    }

    clearFieldErrors() {
        Object.values(this.fieldContainers).forEach((container) => {
            container.dataset.invalid = 'false';
            const error = container.querySelector('.settings-field__error');
            if (error) {
                error.textContent = '';
            }
        });
    }

    showFieldErrors(errors) {
        Object.entries(errors).forEach(([key, message]) => {
            const container = this.fieldContainers[key];
            if (!container) {
                return;
            }
            container.dataset.invalid = 'true';
            const error = container.querySelector('.settings-field__error');
            if (error) {
                error.textContent = message;
            }
        });
    }

    showErrors(messages = []) {
        if (!this.errorsElement) {
            return;
        }
        if (!messages.length) {
            this.errorsElement.innerHTML = '';
            return;
        }
        this.errorsElement.innerHTML = messages
            .map((message) => `<div>${message}</div>`)
            .join('');
    }

    showStatus(message) {
        if (!this.statusElement) {
            return;
        }
        this.statusElement.textContent = message || '';
    }

    clearMessages() {
        this.clearFieldErrors();
        this.showErrors([]);
        this.showStatus('');
    }

    async handleSubmit() {
        if (!this.messenger) {
            return;
        }
        const settings = this.collectSettingsFromForm();
        const { isValid, fieldErrors, messages } = this.validate(settings);

        this.clearMessages();
        if (!isValid) {
            this.showFieldErrors(fieldErrors);
            this.showErrors(messages);
            return;
        }

        try {
            const permissionGranted = await requestJiraPermission(settings);
            if (!permissionGranted) {
                this.showErrors([
                    'Jira permission not granted. Allow access to your Jira site to enable syncing.',
                ]);
                return;
            }
            const state = await this.messenger.sendMessage('saveSettings', {
                settings,
            });
            this.onStateUpdate?.(state);
            this.showStatus('Settings saved successfully.');
            this.toastManager?.show('Settings saved.', { variant: 'success' });
        } catch (error) {
            console.error('Failed to save settings', error);
            this.showErrors(['Failed to save settings. Please try again.']);
            this.toastManager?.show('Unable to save settings.', {
                variant: 'danger',
            });
        }
    }

    async handleCopyToken() {
        if (!this.tokenSecret) {
            return;
        }
        try {
            await navigator.clipboard.writeText(this.tokenSecret);
            this.toastManager?.show('Jira token copied to clipboard.', {
                variant: 'success',
            });
        } catch (error) {
            console.error('Failed to copy token', error);
            this.toastManager?.show('Unable to copy token.', {
                variant: 'danger',
            });
        }
    }

    async handlePasteToken() {
        try {
            const text = await navigator.clipboard.readText();
            if (this.inputs.jiraToken) {
                this.inputs.jiraToken.value = text;
                delete this.inputs.jiraToken.dataset.placeholder;
            }
            this.tokenSecret = text;
            this.updateTokenControls();
            this.toastManager?.show('Token pasted.', { variant: 'success' });
        } catch (error) {
            console.error('Failed to paste token', error);
            this.toastManager?.show('Unable to read from clipboard.', {
                variant: 'danger',
            });
        }
    }
}
