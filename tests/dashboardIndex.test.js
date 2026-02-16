import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardTaskManager } from '../src/dashboard/tasks.js';
import { DashboardSettingsManager } from '../src/dashboard/settings.js';
import { DashboardStatisticsManager } from '../src/dashboard/statistics.js';
import { ACTIONS } from '../src/shared/runtimeActions.js';
import { DashboardApp, DashboardToastManager } from '../src/dashboard/index.js';

function createDashboardFixture() {
    document.body.innerHTML = `
        <nav>
            <button class="dashboard-nav__item" data-section="tasks">Tasks</button>
            <button class="dashboard-nav__item" data-section="statistics">Statistics</button>
            <button class="dashboard-nav__item" data-section="settings">Settings</button>
        </nav>
        <div id="dashboardToasts"></div>
        <section id="dashboardTasksSection"></section>
        <section id="dashboardStatisticsSection"></section>
        <section id="dashboardSettingsSection"></section>
    `;
}

describe('DashboardToastManager', () => {
    it('adds and dismisses toasts through lifecycle timers', () => {
        createDashboardFixture();
        const toastContainer = document.getElementById('dashboardToasts');
        const manager = new DashboardToastManager(toastContainer);

        manager.show('Saved', { timeout: 50, variant: 'success' });
        expect(toastContainer.children).toHaveLength(1);
        expect(manager.activeToasts.size).toBe(1);

        vi.advanceTimersByTime(50);
        expect(manager.activeToasts.size).toBe(0);

        vi.advanceTimersByTime(200);
        expect(toastContainer.children).toHaveLength(0);
    });
});

describe('DashboardApp', () => {
    beforeEach(() => {
        createDashboardFixture();
        window.location.hash = '#statistics';

        chrome.runtime.sendMessage.mockImplementation((payload, callback) => {
            if (payload.action === ACTIONS.GET_STATE) {
                callback({
                    state: { settings: {}, statistics: {}, tasks: [] },
                });
                return;
            }
            if (payload.action === ACTIONS.GET_STATISTICS_HISTORY) {
                callback({ success: true, history: {} });
                return;
            }
            callback({ state: {} });
        });
    });

    it('wires manager initialization and sets active section from hash', async () => {
        const taskInit = vi.spyOn(DashboardTaskManager.prototype, 'init');
        const settingsInit = vi.spyOn(
            DashboardSettingsManager.prototype,
            'init'
        );
        const statsInit = vi.spyOn(
            DashboardStatisticsManager.prototype,
            'init'
        );
        const statsRefresh = vi
            .spyOn(DashboardStatisticsManager.prototype, 'refreshHistory')
            .mockResolvedValue(undefined);

        const app = new DashboardApp();
        await app.init();

        expect(taskInit).toHaveBeenCalledTimes(1);
        expect(settingsInit).toHaveBeenCalledTimes(1);
        expect(statsInit).toHaveBeenCalledTimes(1);
        expect(app.activeSection).toBe('statistics');
        expect(statsRefresh).toHaveBeenCalled();
        expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
});
