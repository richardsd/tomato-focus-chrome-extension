export class BadgeManager {
    static update(timeLeft, isRunning, isWorkSession) {
        if (timeLeft <= 0 || !isRunning) {
            chrome.action.setBadgeText({ text: '' });
            return;
        }

        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        let badgeText = '';

        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            badgeText = `${hours}h${remainingMinutes > 0 ? remainingMinutes : ''}`;
        } else if (minutes >= 1) {
            badgeText = `${minutes}m`;
        } else {
            // Show seconds when less than 1 minute remains
            badgeText = `${seconds}s`;
        }

        chrome.action.setBadgeText({ text: badgeText });

        const badgeColor = isWorkSession ? '#ff4444' : '#44ff44';
        chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    }
}
