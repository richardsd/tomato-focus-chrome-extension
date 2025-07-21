let isRunning = false;
let timeLeft = 25 * 60;
let interval;
let currentSession = 1;
let isWorkSession = true;
let settings = {
    workDuration: 25,
    shortBreak: 5,
    longBreak: 15,
    longBreakInterval: 4
};

function saveState() {
    chrome.storage.local.set({
        pomodoroState: {
            isRunning,
            timeLeft,
            currentSession,
            isWorkSession,
            settings
        }
    });
}

function loadState(callback) {
    chrome.storage.local.get(['pomodoroState'], (result) => {
        if (result.pomodoroState) {
            isRunning = result.pomodoroState.isRunning;
            timeLeft = result.pomodoroState.timeLeft;
            currentSession = result.pomodoroState.currentSession;
            isWorkSession = result.pomodoroState.isWorkSession;
            settings = result.pomodoroState.settings;
        }
        callback();
    });
}

function updateTimerDisplay() {
    const state = { isRunning, timeLeft, currentSession, isWorkSession, settings };
    
    // Only try to send messages if there are active listeners
    chrome.runtime.sendMessage({ action: 'updateTimer', state }).catch((error) => {
        // Ignore connection errors when no popup is open
        if (!error.message.includes('Receiving end does not exist')) {
            console.warn('Failed to send timer update:', error.message);
        }
    });
    
    saveState();
}

function startTimer() {
    if (!isRunning) {
        isRunning = true;
        interval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft <= 0) {
                clearInterval(interval);
                isRunning = false;
                handleSessionEnd();
            }
        }, 1000);
    } else {
        clearInterval(interval);
        isRunning = false;
    }
    updateTimerDisplay();
}

function resetTimer() {
    clearInterval(interval);
    isRunning = false;
    timeLeft = settings.workDuration * 60;
    isWorkSession = true;
    currentSession = 1;
    updateTimerDisplay();
}

function handleSessionEnd() {
    if (isWorkSession) {
        currentSession++;
        if (currentSession % settings.longBreakInterval === 0) {
            timeLeft = settings.longBreak * 60;
            showNotification('Pomodoro Timer', 'Time for a long break!');
        } else {
            timeLeft = settings.shortBreak * 60;
            showNotification('Pomodoro Timer', 'Time for a short break!');
        }
        isWorkSession = false;
    } else {
        timeLeft = settings.workDuration * 60;
        isWorkSession = true;
        showNotification('Pomodoro Timer', 'Time to work!');
    }
    updateTimerDisplay();
    startTimer();
}

function showNotification(title, message) {
    // Check if notifications are supported and permitted
    chrome.notifications.getPermissionLevel((level) => {
        if (level === 'granted') {
            chrome.notifications.create('', {
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: title,
                message: message,
                silent: false,
                requireInteraction: false
            }, (notificationId) => {
                if (chrome.runtime.lastError) {
                    console.error('Notification error:', chrome.runtime.lastError.message);
                    // Fallback notification without icon
                    chrome.notifications.create('', {
                        type: 'basic',
                        title: title,
                        message: message,
                        silent: false,
                        requireInteraction: false
                    });
                } else {
                    console.log('Notification created:', notificationId);
                }
            });
        } else {
            console.warn('Notifications not permitted. Permission level:', level);
            // Try to show a basic notification anyway
            chrome.notifications.create('', {
                type: 'basic',
                title: title,
                message: message,
                silent: false
            });
        }
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (request.action === 'getState') {
            sendResponse({ isRunning, timeLeft, currentSession, isWorkSession, settings });
        } else if (request.action === 'toggleTimer') {
            startTimer();
            sendResponse({ isRunning, timeLeft, currentSession, isWorkSession, settings });
        } else if (request.action === 'resetTimer') {
            resetTimer();
            sendResponse({ isRunning, timeLeft, currentSession, isWorkSession, settings });
        } else if (request.action === 'saveSettings') {
            settings = request.settings;
            resetTimer();
            sendResponse({ isRunning, timeLeft, currentSession, isWorkSession, settings });
        } else if (request.action === 'checkNotifications') {
            chrome.notifications.getPermissionLevel((level) => {
                sendResponse({ permissionLevel: level });
            });
            return true; // Keep alive for async response
        }
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ error: error.message });
    }
    
    // Keep the service worker alive by returning true if async
    return true;
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
    console.log('Service worker started');
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated');
    
    // Check notification permissions
    chrome.notifications.getPermissionLevel((level) => {
        console.log('Notification permission level:', level);
        if (level !== 'granted') {
            console.warn('Notifications may not work. Permission level:', level);
        }
    });
});

// Load initial state
loadState(() => {
    updateTimerDisplay();
});
