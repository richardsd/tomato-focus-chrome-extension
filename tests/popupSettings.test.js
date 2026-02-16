import { beforeEach, describe, expect, it } from 'vitest';

import {
    SettingsManager,
    validateSettingsValues,
} from '../src/popup/settings.js';
import { POPUP_CONSTANTS } from '../src/popup/common.js';

const createValidSettings = () => ({
    workDuration: 25,
    shortBreak: 5,
    longBreak: 15,
    longBreakInterval: 4,
    autoStart: false,
    theme: 'system',
    pauseOnIdle: true,
    playSound: true,
    volume: 0.7,
    jiraUrl: 'https://example.atlassian.net',
    jiraUsername: 'user@example.com',
    jiraToken: 'token',
    autoSyncJira: false,
    jiraSyncInterval: 30,
});

const addInput = ({ id, type = 'text', value = '', checked = false }) => {
    const input = document.createElement('input');
    input.id = id;
    input.type = type;

    if (type === 'checkbox') {
        input.checked = checked;
    } else {
        input.value = value;
    }

    document.body.appendChild(input);
    return input;
};

const addSelect = ({
    id,
    value = 'system',
    options = ['light', 'dark', 'system'],
}) => {
    const select = document.createElement('select');
    select.id = id;

    options.forEach((optionValue) => {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        if (optionValue === value) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    document.body.appendChild(select);
    return select;
};

const createSettingsFormFixture = (overrides = {}) => {
    addInput({ id: 'workDuration', type: 'number', value: '50' });
    addInput({ id: 'shortBreak', type: 'number', value: '10' });
    addInput({ id: 'longBreak', type: 'number', value: '20' });
    addInput({ id: 'longBreakInterval', type: 'number', value: '3' });
    addInput({ id: 'autoStart', type: 'checkbox', checked: true });
    addSelect({ id: 'theme', value: 'dark' });
    addInput({ id: 'pauseOnIdle', type: 'checkbox', checked: false });
    addInput({ id: 'playSound', type: 'checkbox', checked: true });
    addInput({ id: 'volume', type: 'number', value: '0.35' });
    addInput({ id: 'jiraUrl', value: '  https://jira.example.com  ' });
    addInput({ id: 'jiraUsername', value: '  alice  ' });
    addInput({ id: 'jiraToken', value: '  secret-token  ' });
    addInput({ id: 'autoSyncJira', type: 'checkbox', checked: true });
    addInput({ id: 'jiraSyncInterval', type: 'number', value: '45' });

    for (const [id, value] of Object.entries(overrides)) {
        const input = document.getElementById(id);
        if (!input) {
            continue;
        }

        if (typeof value === 'boolean' && input.type === 'checkbox') {
            input.checked = value;
        } else {
            input.value = value;
        }
    }
};

describe('validateSettingsValues', () => {
    it('accepts valid settings', () => {
        const result = validateSettingsValues(createValidSettings());

        expect(result).toEqual({ isValid: true, errors: [] });
    });

    it('validates duration constraints and long break interval bounds', () => {
        const belowMinimumDurations = validateSettingsValues({
            ...createValidSettings(),
            workDuration: 0,
            shortBreak: 0,
            longBreakInterval: 13,
        });

        const invalidLongBreak = validateSettingsValues({
            ...createValidSettings(),
            shortBreak: 1,
            longBreak: 0,
        });

        expect(belowMinimumDurations.isValid).toBe(false);
        expect(belowMinimumDurations.errors).toContain(
            'Work duration must be at least 1 minute'
        );
        expect(belowMinimumDurations.errors).toContain(
            'Short break must be at least 1 minute'
        );
        expect(belowMinimumDurations.errors).toContain(
            'Sessions before long break must be between 1 and 12'
        );

        expect(invalidLongBreak.errors).toContain(
            'Long break must be at least as long as the short break'
        );
        expect(invalidLongBreak.errors).toContain(
            'Long break must be at least 1 minute'
        );
    });

    it('validates volume bounds', () => {
        const tooLow = validateSettingsValues({
            ...createValidSettings(),
            volume: -0.01,
        });
        const tooHigh = validateSettingsValues({
            ...createValidSettings(),
            volume: 1.01,
        });

        expect(tooLow.errors).toContain('Volume must be between 0 and 1');
        expect(tooHigh.errors).toContain('Volume must be between 0 and 1');
    });

    it('requires Jira fields to be complete when any Jira field is set', () => {
        const result = validateSettingsValues({
            ...createValidSettings(),
            jiraToken: '',
        });

        expect(result.errors).toContain(
            'Jira URL, username, and token are all required for Jira integration'
        );
    });

    it('requires Jira credentials before enabling auto sync', () => {
        const result = validateSettingsValues({
            ...createValidSettings(),
            jiraUsername: '',
            autoSyncJira: true,
        });

        expect(result.errors).toContain(
            'Enable periodic sync only after entering Jira URL, username, and token'
        );
    });

    it('validates sync interval bounds and finite values', () => {
        const belowMinimum = validateSettingsValues({
            ...createValidSettings(),
            jiraSyncInterval: 4,
        });
        const aboveMaximum = validateSettingsValues({
            ...createValidSettings(),
            jiraSyncInterval: 721,
        });
        const nonFinite = validateSettingsValues({
            ...createValidSettings(),
            jiraSyncInterval: Number.POSITIVE_INFINITY,
        });

        expect(belowMinimum.errors).toContain(
            'Sync interval must be between 5 and 720 minutes'
        );
        expect(aboveMaximum.errors).toContain(
            'Sync interval must be between 5 and 720 minutes'
        );
        expect(nonFinite.errors).toContain(
            'Sync interval must be between 5 and 720 minutes'
        );
    });
});

describe('SettingsManager.getSettings', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('parses form values from the DOM', () => {
        createSettingsFormFixture();

        const manager = new SettingsManager();
        const settings = manager.getSettings();

        expect(settings).toEqual({
            workDuration: 50,
            shortBreak: 10,
            longBreak: 20,
            longBreakInterval: 3,
            autoStart: true,
            theme: 'dark',
            pauseOnIdle: false,
            playSound: true,
            volume: 0.35,
            jiraUrl: 'https://jira.example.com',
            jiraUsername: 'alice',
            jiraToken: 'secret-token',
            autoSyncJira: true,
            jiraSyncInterval: 45,
        });
    });

    it('falls back to defaults for missing or invalid values', () => {
        createSettingsFormFixture({
            workDuration: '',
            shortBreak: '0',
            longBreak: 'abc',
            longBreakInterval: '',
            autoStart: false,
            volume: 'not-a-number',
            jiraUrl: '   ',
            jiraUsername: '   ',
            jiraToken: '   ',
            autoSyncJira: false,
            jiraSyncInterval: 'NaN',
        });

        document.getElementById('pauseOnIdle').remove();
        document.getElementById('playSound').remove();

        const manager = new SettingsManager();
        const settings = manager.getSettings();

        expect(settings.workDuration).toBe(25);
        expect(settings.shortBreak).toBe(5);
        expect(settings.longBreak).toBe(15);
        expect(settings.longBreakInterval).toBe(4);
        expect(settings.pauseOnIdle).toBe(true);
        expect(settings.playSound).toBe(true);
        expect(settings.volume).toBe(
            POPUP_CONSTANTS.DEFAULT_STATE.settings.volume
        );
        expect(settings.jiraUrl).toBe('');
        expect(settings.jiraUsername).toBe('');
        expect(settings.jiraToken).toBe('');
        expect(settings.jiraSyncInterval).toBe(
            POPUP_CONSTANTS.DEFAULT_STATE.settings.jiraSyncInterval
        );
    });
});
