/**
 * Offscreen document for playing audio in Chrome extensions
 * This is needed because service workers don't have access to the Audio API
 */
/* global Audio */

// Keep track of any audio instances
let currentAudio = null;

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'playSound') {
        playNotificationSound(message.soundUrl, message.volume)
            .then(() => {
                sendResponse({ success: true });
            })
            .catch((error) => {
                if (
                    error.message &&
                    error.message.includes('interrupted by a call to pause')
                ) {
                    console.warn('Sound playback interrupted by pause');
                    sendResponse({ success: true });
                } else {
                    console.error('Error playing sound:', error);
                    sendResponse({ success: false, error: error.message });
                }
            });

        // Return true to indicate we'll send a response asynchronously
        return true;
    }
});

/**
 * Play a notification sound
 * @param {string} soundUrl - The URL of the sound file
 * @param {number} volume - Volume level (0-1)
 */
async function playNotificationSound(soundUrl, volume = 1) {
    try {
        // Stop any currently playing audio
        if (currentAudio) {
            try {
                currentAudio.pause();
            } catch {
                // ignore pause errors
            }
            currentAudio.currentTime = 0;
        }

        // Create new audio instance
        currentAudio = new Audio(soundUrl);
        currentAudio.volume = Math.max(0, Math.min(1, volume)); // Clamp volume between 0 and 1

        // Play the sound
        await currentAudio.play();

        console.log('Notification sound played successfully');
    } catch (error) {
        console.error('Failed to play notification sound:', error);
        throw error;
    }
}

// Clean up when the document is about to be closed
window.addEventListener('beforeunload', () => {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
});

console.log('Offscreen audio document loaded');
