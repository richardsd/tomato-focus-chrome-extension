let isRunning = false;
let timeLeft = 25 * 60;
let interval;
let currentSession = 1;
let isWorkSession = true;
let settings = {
    workDuration: 25,
    shortBreak: 5,
    longBreak: 15,
    longBreakInterval: 4,
    autoStart: false,
    lightTheme: false
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

function updateBadge() {
    if (timeLeft <= 0 || !isRunning) {
        // Clear badge when timer is not running or finished
        chrome.action.setBadgeText({ text: '' });
        chrome.action.setBadgeBackgroundColor({ color: '#ff4444' });
        return;
    }
    
    const minutes = Math.floor(timeLeft / 60);
    
    // Format time for badge (show only minutes for better readability)
    let badgeText = '';
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        badgeText = `${hours}h${remainingMinutes > 0 ? remainingMinutes : ''}`;
    } else {
        badgeText = `${minutes}m`;
    }
    
    // Set badge text
    chrome.action.setBadgeText({ text: badgeText });
    
    // Set badge color based on session type
    const badgeColor = isWorkSession ? '#ff4444' : '#44ff44'; // Red for work, green for break
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
}

function updateTimerDisplay() {
    const state = { isRunning, timeLeft, currentSession, isWorkSession, settings };
    
    // Update badge with current time
    updateBadge();
    
    // Update context menus
    updateContextMenus();
    
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
        updateTimerDisplay();
    }
}

function pauseTimer() {
    if (isRunning) {
        clearInterval(interval);
        isRunning = false;
        updateTimerDisplay();
    }
}

function toggleTimer() {
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
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
    
    // Only auto-start next period if the setting is enabled
    if (settings.autoStart) {
        startTimer();
    }
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

function skipBreak() {
    if (!isWorkSession) {
        clearInterval(interval);
        isRunning = false;
        timeLeft = settings.workDuration * 60;
        isWorkSession = true;
        updateTimerDisplay();
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (request.action === 'getState') {
            sendResponse({ isRunning, timeLeft, currentSession, isWorkSession, settings });
        } else if (request.action === 'toggleTimer') {
            toggleTimer();
            sendResponse({ isRunning, timeLeft, currentSession, isWorkSession, settings });
        } else if (request.action === 'resetTimer') {
            resetTimer();
            sendResponse({ isRunning, timeLeft, currentSession, isWorkSession, settings });
        } else if (request.action === 'skipBreak') {
            skipBreak();
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
    
    // Create context menus
    createContextMenus();
    
    // Check notification permissions
    chrome.notifications.getPermissionLevel((level) => {
        console.log('Notification permission level:', level);
        if (level !== 'granted') {
            console.warn('Notifications may not work. Permission level:', level);
        }
    });
});

function createContextMenus() {
    // Clear existing menus first
    chrome.contextMenus.removeAll(() => {
        // Main action items
        chrome.contextMenus.create({
            id: 'start-pause',
            title: 'Start Timer',
            contexts: ['action']
        });
        
        chrome.contextMenus.create({
            id: 'reset',
            title: 'Reset Timer',
            contexts: ['action']
        });
        
        chrome.contextMenus.create({
            id: 'skip-break',
            title: 'Skip Break',
            contexts: ['action'],
            enabled: false // Will be enabled during breaks
        });
        
        // Separator
        chrome.contextMenus.create({
            id: 'separator1',
            type: 'separator',
            contexts: ['action']
        });
        
        // Quick time settings
        chrome.contextMenus.create({
            id: 'quick-times',
            title: 'Quick Start',
            contexts: ['action']
        });
        
        chrome.contextMenus.create({
            id: 'quick-5',
            parentId: 'quick-times',
            title: '5 minutes',
            contexts: ['action']
        });
        
        chrome.contextMenus.create({
            id: 'quick-15',
            parentId: 'quick-times',
            title: '15 minutes',
            contexts: ['action']
        });
        
        chrome.contextMenus.create({
            id: 'quick-25',
            parentId: 'quick-times',
            title: '25 minutes (Pomodoro)',
            contexts: ['action']
        });
        
        chrome.contextMenus.create({
            id: 'quick-45',
            parentId: 'quick-times',
            title: '45 minutes',
            contexts: ['action']
        }, () => {
            // After all menus are created, update them with current state
            if (!chrome.runtime.lastError) {
                updateContextMenus();
            }
        });
    });
}

function updateContextMenus() {
    // Update the start/pause menu item based on current state
    const startPauseTitle = isRunning ? 'Pause Timer' : 'Start Timer';
    chrome.contextMenus.update('start-pause', { title: startPauseTitle }, () => {
        if (chrome.runtime.lastError) {
            // Ignore error if menu doesn't exist yet
            console.log('Context menu not ready yet:', chrome.runtime.lastError.message);
        }
    });
    
    // Enable/disable skip break based on current session type
    chrome.contextMenus.update('skip-break', { enabled: !isWorkSession && timeLeft > 0 }, () => {
        if (chrome.runtime.lastError) {
            // Ignore error if menu doesn't exist yet
            console.log('Context menu not ready yet:', chrome.runtime.lastError.message);
        }
    });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    switch (info.menuItemId) {
        case 'start-pause':
            toggleTimer();
            break;
        case 'reset':
            resetTimer();
            break;
        case 'skip-break':
            skipBreak();
            break;
        case 'quick-5':
            startQuickTimer(5);
            break;
        case 'quick-15':
            startQuickTimer(15);
            break;
        case 'quick-25':
            startQuickTimer(25);
            break;
        case 'quick-45':
            startQuickTimer(45);
            break;
    }
});

function startQuickTimer(minutes) {
    clearInterval(interval);
    isRunning = false;
    timeLeft = minutes * 60;
    isWorkSession = true; // Quick timers are work sessions
    updateTimerDisplay();
    updateContextMenus();
    startTimer();
}

// Load initial state
loadState(() => {
    // Delay initial update to allow context menus to be created first
    setTimeout(() => {
        updateTimerDisplay();
    }, 100);
});
