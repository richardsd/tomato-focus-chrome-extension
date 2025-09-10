import { CONSTANTS, chromePromise } from './constants.js';

export class NotificationManager {
    static async show(title, message, settings = {}) {
        try {
            const permissionLevel = await chromePromise.notifications.getPermissionLevel();

            if (permissionLevel !== 'granted') {
                console.warn('Notifications not permitted. Permission level:', permissionLevel);
                return;
            }

            const options = {
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title,
                message,
                silent: true, // Always silent - we'll play our custom sound
                requireInteraction: false
            };

            await chromePromise.notifications.create(CONSTANTS.NOTIFICATION_ID, options);
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
                await chromePromise.notifications.create(CONSTANTS.NOTIFICATION_ID, {
                    type: 'basic',
                    title,
                    message,
                    silent: true
                });

                // Still try to play sound on fallback
                if (settings.playSound) {
                    try {
                        await NotificationManager.playSound(settings.volume);
                    } catch (audioError) {
                        console.error('Failed to play sound on fallback:', audioError);
                    }
                }
            } catch (fallbackError) {
                console.error('Fallback notification also failed:', fallbackError);
            }
        }
    }

    static async playSound(volume = 0.7) {
        try {
            // Check if offscreen document already exists
            const existingContexts = await chrome.runtime.getContexts({
                contextTypes: ['OFFSCREEN_DOCUMENT']
            });

            if (existingContexts.length === 0) {
                // Create an offscreen document to play the sound
                // Since service workers don't have access to Audio API
                await chrome.offscreen.createDocument({
                    url: 'offscreen.html',
                    reasons: ['AUDIO_PLAYBACK'],
                    justification: 'Play notification sound'
                });
            }

            // Send message to offscreen document to play sound
            const response = await chrome.runtime.sendMessage({
                action: 'playSound',
                soundUrl: chrome.runtime.getURL('sounds/notification.mp3'),
                volume: typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : 0.7
            });

            if (response && !response.success) {
                throw new Error(response.error || 'Unknown error playing sound');
            }
        } catch (error) {
            console.error('Failed to play sound via offscreen document:', error);
            // Fallback: try using system notification sound
            try {
                await chromePromise.notifications.create('fallback-sound', {
                    type: 'basic',
                    title: 'Tomato Focus',
                    message: '',
                    silent: false
                });
                // Clear the fallback notification immediately
                setTimeout(() => chrome.notifications.clear('fallback-sound'), 100);
            } catch (fallbackError) {
                console.error('Fallback sound notification also failed:', fallbackError);
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
