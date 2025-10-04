import { utils } from '../popup/common.js';

function formatHistory(history = {}) {
    return Object.entries(history)
        .map(([date, value]) => ({
            date,
            completed: value?.completedToday || 0,
            focusTime: value?.focusTimeToday || 0,
        }))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export class DashboardStatisticsManager {
    constructor(options = {}) {
        const { container, messenger, onRequestHistory, onStateUpdate } =
            options;
        this.container = container;
        this.messenger = messenger;
        this.onRequestHistory = onRequestHistory;
        this.onStateUpdate = onStateUpdate;

        this.completedElement = this.container?.querySelector(
            '#dashboardCompletedToday'
        );
        this.focusElement = this.container?.querySelector(
            '#dashboardFocusTime'
        );
        this.historyElement = this.container?.querySelector(
            '#dashboardStatsHistory'
        );
        this.refreshButton = this.container?.querySelector(
            '#dashboardRefreshStats'
        );
        this.clearButton = this.container?.querySelector(
            '#dashboardClearStats'
        );
        this.lastStatistics = {
            completedToday: 0,
            focusTimeToday: 0,
        };
    }

    init() {
        if (this.refreshButton) {
            this.refreshButton.addEventListener('click', () => {
                this.refreshHistory();
            });
        }

        if (this.clearButton) {
            this.clearButton.addEventListener('click', () => {
                this.clearStatistics();
            });
        }
    }

    render(data = {}) {
        const statistics = data.statistics || {
            completedToday: 0,
            focusTimeToday: 0,
        };
        this.lastStatistics = statistics;
        const history = data.history || {};

        if (this.completedElement) {
            this.completedElement.textContent = String(
                statistics.completedToday || 0
            );
        }

        if (this.focusElement) {
            this.focusElement.textContent = utils.formatFocusTime(
                statistics.focusTimeToday || 0
            );
        }

        if (this.historyElement) {
            const entries = formatHistory(history);
            if (!entries.length) {
                this.historyElement.innerHTML =
                    '<p class="empty-state">No statistics recorded yet — complete sessions to see history.</p>';
                return;
            }

            const fragment = document.createDocumentFragment();
            entries.forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'stats-history__row';
                row.innerHTML = `
                    <div class="stats-history__row-date">${entry.date}</div>
                    <div class="stats-history__row-values">
                        <span>${entry.completed} completed</span>
                        <span>${utils.formatFocusTime(entry.focusTime)}</span>
                    </div>
                `;
                fragment.appendChild(row);
            });

            this.historyElement.innerHTML = '';
            this.historyElement.appendChild(fragment);
        }
    }

    async refreshHistory() {
        if (typeof this.onRequestHistory === 'function') {
            const history = await this.onRequestHistory();
            this.render({ history, statistics: this.lastStatistics });
        }
    }

    async clearStatistics() {
        if (!this.messenger) {
            return;
        }

        const confirmClear = window.confirm(
            'Clear all stored statistics? This cannot be undone.'
        );
        if (!confirmClear) {
            return;
        }

        try {
            const state = await this.messenger.sendMessage('clearStatistics');
            if (typeof this.onStateUpdate === 'function') {
                this.onStateUpdate(state);
            }
            await this.refreshHistory();
        } catch (error) {
            console.error('Failed to clear statistics', error);
        }
    }
}
