import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardSettingsManager } from '../src/dashboard/settings.js';
import { ACTIONS } from '../src/shared/runtimeActions.js';

function createSettingsFixture() {
    document.body.innerHTML = `
        <section id="settingsRoot">
            <form id="dashboardSettingsForm">
                <div class="settings-field" data-field="workDuration">
                    <input id="dsWorkDuration" type="number" min="1" max="90" value="25" />
                    <p class="settings-field__error"></p>
                </div>
                <div class="settings-field" data-field="shortBreak">
                    <input id="dsShortBreak" type="number" min="1" max="30" value="5" />
                    <p class="settings-field__error"></p>
                </div>
                <div class="settings-field" data-field="longBreak">
                    <input id="dsLongBreak" type="number" min="1" max="60" value="15" />
                    <p class="settings-field__error"></p>
                </div>
                <div class="settings-field" data-field="longBreakInterval">
                    <input id="dsLongBreakInterval" type="number" min="1" max="12" value="4" />
                    <p class="settings-field__error"></p>
                </div>
                <div class="settings-field" data-field="volume">
                    <input id="dsVolume" type="range" min="0" max="1" step="0.1" value="0.5" />
                    <p class="settings-field__error"></p>
                </div>
                <span id="dsVolumeValue"></span>
                <select id="dsTheme"><option value="system">system</option></select>
                <input id="dsAutoStart" type="checkbox" />
                <input id="dsPauseOnIdle" type="checkbox" />
                <input id="dsPlaySound" type="checkbox" />
                <div class="settings-field" data-field="jiraUrl">
                    <input id="dsJiraUrl" type="url" />
                    <p class="settings-field__error"></p>
                </div>
                <div class="settings-field" data-field="jiraUsername">
                    <input id="dsJiraUsername" type="text" />
                    <p class="settings-field__error"></p>
                </div>
                <div class="settings-field" data-field="jiraToken">
                    <input id="dsJiraToken" type="password" />
                    <p class="settings-field__error"></p>
                </div>
                <input id="dsAutoSyncJira" type="checkbox" />
                <input id="dsJiraSyncInterval" type="number" value="30" />
                <button id="dashboardCopyJiraToken" type="button">copy</button>
                <button id="dashboardPasteJiraToken" type="button">paste</button>
                <button type="button" class="input-stepper__btn" data-target="dsWorkDuration" data-step="5">+</button>
                <button type="submit">save</button>
            </form>
            <button id="dashboardResetSettings" type="button">reset</button>
            <div id="dashboardSettingsErrors"></div>
            <div id="dashboardSettingsStatus"></div>
        </section>
    `;

    return document.getElementById('settingsRoot');
}

describe('DashboardSettingsManager', () => {
    beforeEach(() => {
        chrome.permissions = {
            contains: vi.fn().mockResolvedValue(true),
            request: vi.fn().mockResolvedValue(true),
        };
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: vi.fn().mockResolvedValue(undefined),
                readText: vi.fn().mockResolvedValue('clipboard-token'),
            },
        });
    });

    it('renders Jira-dependent controls and token actions based on URL validity', () => {
        const manager = new DashboardSettingsManager({
            container: createSettingsFixture(),
        });

        manager.render({ jiraUrl: '', jiraToken: 'secret-token' });
        expect(manager.inputs.jiraUsername.disabled).toBe(true);
        expect(manager.copyTokenButton.disabled).toBe(true);
        expect(manager.pasteTokenButton.disabled).toBe(true);

        manager.render({
            jiraUrl: 'https://example.atlassian.net',
            jiraToken: 'secret-token',
        });

        expect(manager.inputs.jiraToken.value).toBe('••••••••••');
        expect(manager.inputs.jiraToken.dataset.placeholder).toBe('true');
        expect(manager.inputs.jiraUsername.disabled).toBe(false);
        expect(manager.copyTokenButton.disabled).toBe(false);
        expect(manager.pasteTokenButton.disabled).toBe(false);
    });

    it('applies stepper updates and saves valid settings via messenger', async () => {
        const sendMessage = vi.fn().mockResolvedValue({ foo: 'state' });
        const onStateUpdate = vi.fn();
        const toastManager = { show: vi.fn() };

        const manager = new DashboardSettingsManager({
            container: createSettingsFixture(),
            messenger: { sendMessage },
            onStateUpdate,
            toastManager,
        });

        manager.init();

        document
            .querySelector('.input-stepper__btn')
            .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        expect(document.getElementById('dsWorkDuration').value).toBe('30');

        manager.inputs.jiraUrl.value = 'https://example.atlassian.net';
        manager.inputs.jiraUsername.value = 'dev';
        manager.inputs.jiraToken.value = 'api-token';

        await manager.handleSubmit();

        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.SAVE_SETTINGS, {
            settings: expect.objectContaining({
                workDuration: 30,
                jiraToken: 'api-token',
            }),
        });
        expect(onStateUpdate).toHaveBeenCalledWith({ foo: 'state' });
        expect(toastManager.show).toHaveBeenCalledWith('Settings saved.', {
            variant: 'success',
        });
        expect(
            document.getElementById('dashboardSettingsStatus').textContent
        ).toBe('Settings saved successfully.');
    });
});
