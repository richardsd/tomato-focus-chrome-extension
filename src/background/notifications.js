import { CONSTANTS, chromePromise } from './constants.js';
import { ACTIONS } from '../shared/runtimeActions.js';

export class NotificationManager {
    static offscreenCreated = false;
    static async show(title, message, settings = {}) {
        try {
            const permissionLevel =
                await chromePromise.notifications.getPermissionLevel();

            if (permissionLevel !== 'granted') {
                console.warn(
                    'Notifications not permitted. Permission level:',
                    permissionLevel
                );
                return;
            }

            const options = {
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title,
                message,
                silent: true, // Always silent - we'll play our custom sound
                requireInteraction: false,
            };

            await chromePromise.notifications.create(
                CONSTANTS.NOTIFICATION_ID,
                options
            );
            console.log('Notification created successfully');

            // Play custom sound if enabled
            if (settings.playSound) {
                try {
                    await NotificationManager.playSound(settings.volume);
                } catch (audioError) {
                    console.error('Failed to play sound:', audioError);
                }
            }
        } catch (error) {
            console.error('Failed to create notification:', error);
            // Fallback notification without icon
            try {
                await chromePromise.notifications.create(
                    CONSTANTS.NOTIFICATION_ID,
                    {
                        type: 'basic',
                        title,
                        message,
                        silent: true,
                    }
                );

                // Still try to play sound on fallback
                if (settings.playSound) {
                    try {
                        await NotificationManager.playSound(settings.volume);
                    } catch (audioError) {
                        console.error(
                            'Failed to play sound on fallback:',
                            audioError
                        );
                    }
                }
            } catch (fallbackError) {
                console.error(
                    'Fallback notification also failed:',
                    fallbackError
                );
            }
        }
    }

    static async playSound(volume = 0.7) {
        try {
            // Ensure only a single offscreen document exists
            if (!NotificationManager.offscreenCreated) {
                const existingContexts = await chrome.runtime.getContexts({
                    contextTypes: ['OFFSCREEN_DOCUMENT'],
                });

                if (existingContexts.length === 0) {
                    await chrome.offscreen.createDocument({
                        url: 'offscreen.html',
                        reasons: ['AUDIO_PLAYBACK'],
                        justification: 'Play notification sound',
                    });
                }

                NotificationManager.offscreenCreated = true;
            }

            // Send message to offscreen document to play sound
            const response = await chrome.runtime.sendMessage({
                action: ACTIONS.PLAY_SOUND,
                soundUrl: chrome.runtime.getURL('sounds/notification.mp3'),
                volume:
                    typeof volume === 'number'
                        ? Math.max(0, Math.min(1, volume))
                        : 0.7,
            });

            if (response && !response.success) {
                if (response.error && response.error.includes('interrupted')) {
                    console.warn('Sound playback interrupted, continuing');
                } else {
                    throw new Error(
                        response.error || 'Unknown error playing sound'
                    );
                }
            }
        } catch (error) {
            console.error(
                'Failed to play sound via offscreen document:',
                error
            );
            // Fallback: try using system notification sound
            try {
                await chromePromise.notifications.create('fallback-sound', {
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Tomato Focus',
                    message: 'Timer complete',
                    silent: false,
                });
                // Clear the fallback notification immediately
                setTimeout(
                    () => chrome.notifications.clear('fallback-sound'),
                    100
                );
            } catch (fallbackError) {
                console.error(
                    'Fallback sound notification also failed:',
                    fallbackError
                );
            }
        }
    }

    static async checkPermissions() {
        try {
            return await chromePromise.notifications.getPermissionLevel();
        } catch (error) {
            console.error('Failed to check notification permissions:', error);
            return 'denied';
        }
    }
}
