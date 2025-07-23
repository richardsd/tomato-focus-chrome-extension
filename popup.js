document.addEventListener('DOMContentLoaded', () => {
    const timerDisplay = document.getElementById('timer');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const skipBreakBtn = document.getElementById('skipBreakBtn');
    const sessionCount = document.getElementById('sessionCount');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const notificationStatus = document.getElementById('notificationStatus');
    const notificationMessage = document.getElementById('notificationMessage');
    
    // Panel navigation elements
    const timerPanel = document.getElementById('timerPanel');
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsBtn = document.getElementById('settingsBtn');
    const backBtn = document.getElementById('backBtn');

    // Panel navigation functions
    function showTimerPanel() {
        timerPanel.style.display = 'block';
        settingsPanel.style.display = 'none';
    }

    function showSettingsPanel() {
        timerPanel.style.display = 'none';
        settingsPanel.style.display = 'block';
    }

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
                                        longBreakInterval: 4,
                                        autoStart: false,
                                        lightTheme: false
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

    function updateProgressRing(state) {
        const progressRing = document.querySelector('.progress-ring-progress');
        if (!progressRing) return;
        
        // Calculate total duration for current session type
        const totalDuration = state.isWorkSession ? 
            state.settings.workDuration * 60 : 
            (state.currentSession % state.settings.longBreakInterval === 0 ? 
             state.settings.longBreak * 60 : 
             state.settings.shortBreak * 60);
        
        // Calculate progress (0 to 1, where 0 is full and 1 is empty)
        const progress = state.timeLeft / totalDuration;
        
        // Calculate circumference (2 * π * radius, where radius = 90)
        const circumference = 2 * Math.PI * 90; // 565.49
        
        // Calculate offset (progress of 1 means no offset, progress of 0 means full offset)
        const offset = circumference * (1 - progress);
        
        // Apply the offset to create the countdown effect
        progressRing.style.strokeDashoffset = offset;
    }

    function updateUI(state) {
        document.getElementById('workDuration').value = state.settings.workDuration;
        document.getElementById('shortBreak').value = state.settings.shortBreak;
        document.getElementById('longBreak').value = state.settings.longBreak;
        document.getElementById('longBreakInterval').value = state.settings.longBreakInterval;
        
        // Update checkbox settings if they exist
        if (state.settings.autoStart !== undefined) {
            document.getElementById('autoStart').checked = state.settings.autoStart;
        }
        if (state.settings.lightTheme !== undefined) {
            document.getElementById('lightTheme').checked = state.settings.lightTheme;
            // Apply light theme to body
            if (state.settings.lightTheme) {
                document.body.classList.add('light-theme');
            } else {
                document.body.classList.remove('light-theme');
            }
        }

        const minutes = Math.floor(state.timeLeft / 60);
        const seconds = state.timeLeft % 60;
        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        sessionCount.textContent = `Session: ${state.currentSession}`;
        
        // Update progress ring animation
        updateProgressRing(state);
        
        // Update theme and UI based on session type
        const body = document.body;
        const sessionIcon = document.getElementById('sessionIcon');
        const sessionIconImg = sessionIcon.querySelector('img');
        const sessionTitle = document.getElementById('sessionTitle');
        
        if (!state.isWorkSession) {
            // Break mode
            body.classList.add('break-mode');
            if (sessionIconImg) {
                sessionIconImg.src = 'icons/green-icon.svg';
                sessionIconImg.alt = 'Green Tomato Break';
            }
            
            // Determine break type
            const isLongBreak = state.currentSession % state.settings.longBreakInterval === 0;
            sessionTitle.textContent = isLongBreak ? 'Long Break' : 'Short Break';
        } else {
            // Work mode
            body.classList.remove('break-mode');
            if (sessionIconImg) {
                sessionIconImg.src = 'icons/icon.svg';
                sessionIconImg.alt = 'Tomato';
            }
            sessionTitle.textContent = 'Pomodoro Timer';
        }
        
        // Update button visibility and text based on timer state
        if (state.isRunning) {
            startBtn.style.display = 'none';
            pauseBtn.style.display = 'inline-block';
        } else {
            pauseBtn.style.display = 'none';
            startBtn.style.display = 'inline-block';
            
            // Show "Resume" if timer has been started but is paused (timeLeft is not at full duration)
            const fullDuration = state.isWorkSession ? state.settings.workDuration * 60 : 
                (state.currentSession % state.settings.longBreakInterval === 0 ? 
                 state.settings.longBreak * 60 : state.settings.shortBreak * 60);
            
            if (state.timeLeft < fullDuration && state.timeLeft > 0) {
                startBtn.textContent = 'Resume';
            } else {
                startBtn.textContent = 'Start';
            }
        }
        
        // Show skip break button only during break sessions
        if (!state.isWorkSession && state.timeLeft > 0) {
            skipBreakBtn.style.display = 'block';
        } else {
            skipBreakBtn.style.display = 'none';
        }
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
            notificationStatus.style.display = 'none';
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

    pauseBtn.addEventListener('click', () => {
        sendMessage('toggleTimer', {}, (response) => {
            if (response) updateUI(response);
        });
    });

    skipBreakBtn.addEventListener('click', () => {
        sendMessage('skipBreak', {}, (response) => {
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
            longBreakInterval: parseInt(document.getElementById('longBreakInterval').value),
            autoStart: document.getElementById('autoStart').checked,
            lightTheme: document.getElementById('lightTheme').checked
        };
        sendMessage('saveSettings', { settings }, (response) => {
            if (response) updateUI(response);
            showTimerPanel(); // Return to timer panel after saving
        });
    });

    // Panel navigation event listeners
    settingsBtn.addEventListener('click', showSettingsPanel);
    backBtn.addEventListener('click', showTimerPanel);

    // Listen for timer updates from background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateTimer') {
            updateUI(request.state);
        }
    });
});
