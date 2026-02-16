import { describe, expect, it } from 'vitest';

import { BadgeManager } from '../src/background/badge.js';

describe('BadgeManager.update', () => {
    it('formats hours and remaining minutes for long durations', () => {
        BadgeManager.update(65 * 60, true, true);

        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
            text: '1h5',
        });
        expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
            color: '#ff4444',
        });
    });

    it('formats whole minutes when at least one minute remains', () => {
        BadgeManager.update(10 * 60, true, false);

        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
            text: '10m',
        });
        expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
            color: '#44ff44',
        });
    });

    it('formats seconds when less than one minute remains', () => {
        BadgeManager.update(45, true, true);

        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
            text: '45s',
        });
    });

    it('clears the badge when timer is not running', () => {
        BadgeManager.update(90, false, true);

        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
        expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
    });
});
