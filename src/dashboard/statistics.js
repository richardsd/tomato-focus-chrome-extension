import { utils } from '../popup/common.js';

function normaliseHistory(history = {}) {
    return Object.entries(history)
        .map(([date, value]) => ({
            date,
            completed: Number(value?.completedToday || 0),
            focusTime: Number(value?.focusTimeToday || 0),
        }))
        .filter((entry) => !Number.isNaN(new Date(entry.date).getTime()))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function formatDateLabel(value) {
    try {
        const date = new Date(value);
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
        });
    } catch (error) {
        console.warn('Failed to format stats label', error);
        return value;
    }
}

export class DashboardStatisticsManager {
    constructor(options = {}) {
        const {
            container,
            messenger,
            onRequestHistory,
            onStateUpdate,
            toastManager,
        } = options;
        this.container = container;
        this.messenger = messenger;
        this.onRequestHistory = onRequestHistory;
        this.onStateUpdate = onStateUpdate;
        this.toastManager = toastManager;

        this.completedElement = this.container?.querySelector(
            '#dashboardCompletedToday'
        );
        this.focusElement = this.container?.querySelector(
            '#dashboardFocusTime'
        );
        this.chartElement = this.container?.querySelector(
            '#dashboardStatsChart'
        );
        this.detailsToggle = this.container?.querySelector(
            '#dashboardStatsDetailsToggle'
        );
        this.detailsElement = this.container?.querySelector(
            '#dashboardStatsDetails'
        );
        this.refreshButton = this.container?.querySelector(
            '#dashboardRefreshStats'
        );
        this.clearButton = this.container?.querySelector(
            '#dashboardClearStats'
        );
        this.rangeButtons = Array.from(
            this.container?.querySelectorAll('[data-range]') || []
        );

        this.history = [];
        this.currentRange = '30';
        this.detailsExpanded = false;
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

        this.rangeButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const range = button.dataset.range;
                if (range && range !== this.currentRange) {
                    this.currentRange = range;
                    this.renderRangeControls();
                    this.renderChart();
                    this.renderDetails();
                }
            });
        });

        if (this.detailsToggle) {
            this.detailsToggle.addEventListener('click', () => {
                this.detailsExpanded = !this.detailsExpanded;
                this.renderDetails();
            });
        }
    }

    render(data = {}) {
        const statistics = data.statistics || {
            completedToday: 0,
            focusTimeToday: 0,
        };
        this.lastStatistics = statistics;
        this.history = normaliseHistory(data.history);

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

        this.renderRangeControls();
        this.renderChart();
        this.renderDetails();
    }

    renderRangeControls() {
        this.rangeButtons.forEach((button) => {
            const isActive = button.dataset.range === this.currentRange;
            button.classList.toggle('is-active', isActive);
            if (isActive) {
                button.setAttribute('aria-pressed', 'true');
            } else {
                button.removeAttribute('aria-pressed');
            }
        });
    }

    getRangeData() {
        if (!this.history.length) {
            return [];
        }

        if (this.currentRange === 'all') {
            return [...this.history];
        }
        const days = Number.parseInt(this.currentRange, 10);
        if (!Number.isFinite(days) || days <= 0) {
            return [...this.history];
        }
        return this.history.slice(-days);
    }

    renderChart() {
        if (!this.chartElement) {
            return;
        }
        const data = this.getRangeData();
        if (!data.length) {
            this.chartElement.innerHTML =
                '<p class="empty-state">No statistics recorded yet — complete sessions to see history.</p>';
            return;
        }

        const maxCompleted = Math.max(
            1,
            ...data.map((entry) => entry.completed || 0)
        );
        const viewBoxWidth = Math.max(100, data.length * 20);
        const horizontalStep =
            data.length > 1 ? viewBoxWidth / (data.length - 1) : 0;
        const chartHeight = 100;
        const bottomPadding = 20;
        const topPadding = 10;
        const usableHeight = chartHeight - bottomPadding - topPadding;

        const points = data.map((entry, index) => {
            const x =
                data.length > 1 ? index * horizontalStep : viewBoxWidth / 2;
            const completionRatio = entry.completed / maxCompleted;
            const y =
                chartHeight - bottomPadding - completionRatio * usableHeight;
            return {
                x,
                y,
                label: formatDateLabel(entry.date),
                value: entry.completed,
            };
        });

        const polylinePoints = points
            .map((point) => `${point.x},${point.y}`)
            .join(' ');
        const lastPoint = points[points.length - 1];
        const areaPoints = [
            `${points[0].x},${chartHeight - bottomPadding}`,
            ...points.map((point) => `${point.x},${point.y}`),
            `${lastPoint.x},${chartHeight - bottomPadding}`,
        ].join(' ');

        const labels = points.filter((_, index) => {
            if (points.length <= 6) {
                return true;
            }
            if (index === 0 || index === points.length - 1) {
                return true;
            }
            return index % Math.ceil(points.length / 6) === 0;
        });

        const svg = `
            <svg viewBox="0 0 ${viewBoxWidth} ${chartHeight}" xmlns="http://www.w3.org/2000/svg" role="presentation">
                <line class="stats-chart__axes" x1="0" y1="${
                    chartHeight - bottomPadding
                }" x2="${viewBoxWidth}" y2="${chartHeight - bottomPadding}" />
                <line class="stats-chart__axes" x1="0" y1="${topPadding}" x2="0" y2="${
                    chartHeight - bottomPadding
                }" />
                <polygon class="stats-chart__area" points="${areaPoints}" />
                <polyline class="stats-chart__line" points="${polylinePoints}" />
                ${points
                    .map(
                        (point) => `
                        <g>
                            <circle class="stats-chart__dot" cx="${point.x}" cy="${point.y}" r="2.8">
                                <title>${point.label}: ${point.value} pomodoros</title>
                            </circle>
                        </g>
                    `
                    )
                    .join('')}
                ${labels
                    .map(
                        (point) => `
                        <text class="stats-chart__label" x="${point.x}" y="${
                            chartHeight - bottomPadding + 12
                        }" text-anchor="middle">${point.label}</text>
                    `
                    )
                    .join('')}
            </svg>
        `;

        this.chartElement.innerHTML = svg;
    }

    renderDetails() {
        if (!this.detailsElement || !this.detailsToggle) {
            return;
        }
        if (!this.history.length) {
            this.detailsElement.innerHTML =
                '<p class="empty-state">No history available yet.</p>';
            this.detailsElement.setAttribute('hidden', 'hidden');
            this.detailsToggle.setAttribute('aria-expanded', 'false');
            this.detailsToggle.textContent = 'Show details';
            return;
        }

        if (this.detailsExpanded) {
            this.detailsElement.removeAttribute('hidden');
            this.detailsToggle.textContent = 'Hide details';
            this.detailsToggle.setAttribute('aria-expanded', 'true');
        } else {
            this.detailsElement.setAttribute('hidden', 'hidden');
            this.detailsToggle.textContent = 'Show details';
            this.detailsToggle.setAttribute('aria-expanded', 'false');
        }

        if (!this.detailsExpanded) {
            return;
        }

        const data = this.getRangeData().slice().reverse();
        if (!data.length) {
            this.detailsElement.innerHTML =
                '<p class="empty-state">No history for this range.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        data.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'stats-details__row';
            row.innerHTML = `
                <span>${formatDateLabel(entry.date)}</span>
                <span>${entry.completed} 🍅 · ${utils.formatFocusTime(entry.focusTime)}</span>
            `;
            fragment.appendChild(row);
        });
        this.detailsElement.innerHTML = '';
        this.detailsElement.appendChild(fragment);
    }

    async refreshHistory() {
        if (typeof this.onRequestHistory !== 'function') {
            return;
        }
        const history = await this.onRequestHistory();
        this.history = normaliseHistory(history);
        this.renderChart();
        this.renderDetails();
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
            this.onStateUpdate?.(state);
            await this.refreshHistory();
            this.toastManager?.show('Statistics cleared.', {
                variant: 'success',
            });
        } catch (error) {
            console.error('Failed to clear statistics', error);
            this.toastManager?.show('Unable to clear statistics.', {
                variant: 'danger',
            });
        }
    }
}
