import { describe, expect, it, vi } from 'vitest';

import { DashboardStatisticsManager } from '../src/dashboard/statistics.js';
import { ACTIONS } from '../src/shared/runtimeActions.js';

function createStatisticsFixture() {
    document.body.innerHTML = `
        <section id="statsRoot">
            <div id="dashboardCompletedToday"></div>
            <div id="dashboardFocusTime"></div>
            <div id="dashboardStatsChart"></div>
            <button id="dashboardStatsDetailsToggle" type="button">Show details</button>
            <div id="dashboardStatsDetails" hidden></div>
            <button id="dashboardRefreshStats" type="button">Refresh</button>
            <button id="dashboardClearStats" type="button">Clear</button>
            <button type="button" data-range="7">7</button>
            <button type="button" data-range="30">30</button>
            <button type="button" data-range="all">all</button>
        </section>
    `;
    return document.getElementById('statsRoot');
}

describe('DashboardStatisticsManager', () => {
    it('renders statistics and updates chart/details when controls are used', async () => {
        const manager = new DashboardStatisticsManager({
            container: createStatisticsFixture(),
            onRequestHistory: vi.fn().mockResolvedValue({
                '2024-01-01': { completedToday: 2, focusTimeToday: 3000 },
            }),
        });

        manager.init();
        manager.render({
            statistics: { completedToday: 3, focusTimeToday: 75 },
            history: {
                '2024-01-01': { completedToday: 1, focusTimeToday: 25 },
                '2024-01-02': { completedToday: 4, focusTimeToday: 100 },
            },
        });

        expect(
            document.getElementById('dashboardCompletedToday').textContent
        ).toBe('3');
        expect(
            document.getElementById('dashboardFocusTime').textContent
        ).toContain('1h');
        expect(
            document.getElementById('dashboardStatsChart').innerHTML
        ).toContain('<svg');

        document.getElementById('dashboardStatsDetailsToggle').click();
        expect(
            document
                .getElementById('dashboardStatsDetailsToggle')
                .getAttribute('aria-expanded')
        ).toBe('true');
        expect(
            document.getElementById('dashboardStatsDetails').innerHTML
        ).toContain('🍅');

        document.querySelector('[data-range="all"]').click();
        expect(
            document.querySelector('[data-range="all"]').classList
        ).toContain('is-active');

        await manager.refreshHistory();
        expect(manager.onRequestHistory).toHaveBeenCalled();
    });

    it('clears statistics, refreshes history, and emits success toast', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        const sendMessage = vi.fn().mockResolvedValue({ state: 'updated' });
        const onStateUpdate = vi.fn();
        const toastManager = { show: vi.fn() };

        const manager = new DashboardStatisticsManager({
            container: createStatisticsFixture(),
            messenger: { sendMessage },
            onRequestHistory: vi.fn().mockResolvedValue({}),
            onStateUpdate,
            toastManager,
        });

        await manager.clearStatistics();

        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.CLEAR_STATISTICS);
        expect(onStateUpdate).toHaveBeenCalledWith({ state: 'updated' });
        expect(toastManager.show).toHaveBeenCalledWith('Statistics cleared.', {
            variant: 'success',
        });
    });
});
