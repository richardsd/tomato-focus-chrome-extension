document.addEventListener('DOMContentLoaded', () => {
    const timerDisplay = document.getElementById('timer');
    const startBtn = document.getElementById('startBtn');
    const resetBtn = document.getElementById('resetBtn');
    const sessionCount = document.getElementById('sessionCount');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const notificationStatus = document.getElementById('notificationStatus');
    const notificationMessage = document.getElementById('notificationMessage');

    // Check notification permissions on load
    function checkNotificationPermissions() {
        sendMessage('checkNotifications', {}, (response) => {
            if (response && response.permissionLevel) {
                showNotificationStatus(response.permissionLevel);
            }
        });
    }

    function sendMessage(action, data = {}, callback) {
        chrome.runtime.sendMessage({ action, ...data }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('Message failed:', chrome.runtime.lastError.message);
                // Retry once after a short delay if the service worker needs to wake up
                setTimeout(() => {
                    chrome.runtime.sendMessage({ action, ...data }, (retryResponse) => {
                        if (chrome.runtime.lastError) {
                            console.error('Retry failed:', chrome.runtime.lastError.message);
                            // Provide default state if connection completely fails
                            if (callback && action === 'getState') {
                                callback({
                                    isRunning: false,
                                    timeLeft: 25 * 60,
                                    currentSession: 1,
                                    isWorkSession: true,
                                    settings: {
                                        workDuration: 25,
                                        shortBreak: 5,
                                        longBreak: 15,
                                        longBreakInterval: 4
                                    }
                                });
                            }
                        } else if (callback) {
                            callback(retryResponse);
                        }
                    });
                }, 100);
            } else if (callback) {
                callback(response);
            }
        });
    }

    function updateUI(state) {
        document.getElementById('workDuration').value = state.settings.workDuration;
        document.getElementById('shortBreak').value = state.settings.shortBreak;
        document.getElementById('longBreak').value = state.settings.longBreak;
        document.getElementById('longBreakInterval').value = state.settings.longBreakInterval;

        const minutes = Math.floor(state.timeLeft / 60);
        const seconds = state.timeLeft % 60;
        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        sessionCount.textContent = `Session: ${state.currentSession}`;
        startBtn.textContent = state.isRunning ? '⏸️ Pause' : '▶️ Start';
    }

    function showNotificationStatus(permissionLevel) {
        if (permissionLevel !== 'granted') {
            notificationStatus.style.display = 'block';
            notificationStatus.className = 'mt-4 p-3 rounded-lg text-sm bg-yellow-100 border border-yellow-400';
            
            if (navigator.platform.includes('Mac')) {
                notificationMessage.innerHTML = `
                    <strong>⚠️ Notifications Disabled</strong><br>
                    To enable Pomodoro notifications on macOS:<br>
                    1. Open <strong>System Preferences</strong><br>
                    2. Go to <strong>Notifications & Focus</strong><br>
                    3. Find <strong>Google Chrome</strong> in the list<br>
                    4. Enable <strong>Allow Notifications</strong><br>
                    5. Reload this extension and test again
                `;
            } else {
                notificationMessage.innerHTML = `
                    <strong>⚠️ Notifications Disabled</strong><br>
                    Please enable notifications for Chrome in your system settings.
                `;
            }
        } else {
            notificationStatus.style.display = 'block';
            notificationStatus.className = 'mt-4 p-3 rounded-lg text-sm bg-green-100 border border-green-400';
            notificationMessage.innerHTML = `
                <strong>✅ Notifications Enabled</strong><br>
                You'll receive alerts when Pomodoro sessions end.
            `;
        }
    }

    // Initial state load with retry
    sendMessage('getState', {}, (response) => {
        if (response) updateUI(response);
    });

    // Check notification permissions
    checkNotificationPermissions();

    startBtn.addEventListener('click', () => {
        sendMessage('toggleTimer', {}, (response) => {
            if (response) updateUI(response);
        });
    });

    resetBtn.addEventListener('click', () => {
        sendMessage('resetTimer', {}, (response) => {
            if (response) updateUI(response);
        });
    });

    saveSettingsBtn.addEventListener('click', () => {
        const settings = {
            workDuration: parseInt(document.getElementById('workDuration').value),
            shortBreak: parseInt(document.getElementById('shortBreak').value),
            longBreak: parseInt(document.getElementById('longBreak').value),
            longBreakInterval: parseInt(document.getElementById('longBreakInterval').value)
        };
        sendMessage('saveSettings', { settings }, (response) => {
            if (response) updateUI(response);
        });
    });

    // Listen for timer updates from background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateTimer') {
            updateUI(request.state);
        }
    });
});
