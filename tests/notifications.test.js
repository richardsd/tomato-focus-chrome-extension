import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONSTANTS, chromePromise } from '../src/background/constants.js';
import { NotificationManager } from '../src/background/notifications.js';
import { ACTIONS } from '../src/shared/runtimeActions.js';

const flushPromises = async () => Promise.resolve();

describe('NotificationManager.show', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        NotificationManager.offscreenCreated = false;
    });

    it('gates notifications when permission is not granted', async () => {
        vi.spyOn(
            chromePromise.notifications,
            'getPermissionLevel'
        ).mockResolvedValue('denied');
        const createSpy = vi.spyOn(chromePromise.notifications, 'create');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await NotificationManager.show('Title', 'Message');

        expect(createSpy).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
            'Notifications not permitted. Permission level:',
            'denied'
        );
    });

    it('creates a notification with expected options', async () => {
        vi.spyOn(
            chromePromise.notifications,
            'getPermissionLevel'
        ).mockResolvedValue('granted');
        const createSpy = vi.spyOn(chromePromise.notifications, 'create');

        await NotificationManager.show('Focus done', 'Take a break');

        expect(createSpy).toHaveBeenCalledWith(CONSTANTS.NOTIFICATION_ID, {
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Focus done',
            message: 'Take a break',
            silent: true,
            requireInteraction: false,
        });
    });

    it('uses fallback notification options when primary creation fails', async () => {
        vi.spyOn(
            chromePromise.notifications,
            'getPermissionLevel'
        ).mockResolvedValue('granted');

        const createSpy = vi
            .spyOn(chromePromise.notifications, 'create')
            .mockRejectedValueOnce(new Error('primary failed'))
            .mockResolvedValueOnce(CONSTANTS.NOTIFICATION_ID);

        await NotificationManager.show('Title', 'Message');

        expect(createSpy).toHaveBeenNthCalledWith(
            1,
            CONSTANTS.NOTIFICATION_ID,
            {
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Title',
                message: 'Message',
                silent: true,
                requireInteraction: false,
            }
        );
        expect(createSpy).toHaveBeenNthCalledWith(
            2,
            CONSTANTS.NOTIFICATION_ID,
            {
                type: 'basic',
                title: 'Title',
                message: 'Message',
                silent: true,
            }
        );
    });
});

describe('NotificationManager.playSound', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        NotificationManager.offscreenCreated = false;
        chrome.runtime.getContexts.mockResolvedValue([]);
        chrome.runtime.sendMessage.mockResolvedValue({ success: true });
        chrome.notifications.clear = vi.fn();
    });

    it('creates an offscreen document and sends play sound message', async () => {
        await NotificationManager.playSound(0.7);

        expect(chrome.runtime.getContexts).toHaveBeenCalledWith({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
        });
        expect(chrome.offscreen.createDocument).toHaveBeenCalledWith({
            url: 'offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play notification sound',
        });
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: ACTIONS.PLAY_SOUND,
            soundUrl: 'chrome-extension://mock/sounds/notification.mp3',
            volume: 0.7,
        });
        expect(NotificationManager.offscreenCreated).toBe(true);
    });

    it('clamps volume values before sending play sound message', async () => {
        await NotificationManager.playSound(2);
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
            expect.objectContaining({ volume: 1 })
        );

        await NotificationManager.playSound(-0.4);
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
            expect.objectContaining({ volume: 0 })
        );

        await NotificationManager.playSound('loud');
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
            expect.objectContaining({ volume: 0.7 })
        );
    });

    it('creates fallback sound notification when offscreen playback fails', async () => {
        chrome.runtime.sendMessage.mockRejectedValueOnce(
            new Error('worker down')
        );

        await NotificationManager.playSound(0.5);

        expect(chrome.notifications.create).toHaveBeenCalledWith(
            'fallback-sound',
            {
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Tomato Focus',
                message: 'Timer complete',
                silent: false,
            },
            expect.any(Function)
        );

        vi.runAllTimers();
        await flushPromises();

        expect(chrome.notifications.clear).toHaveBeenCalledWith(
            'fallback-sound'
        );
    });
});
