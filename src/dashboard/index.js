import { POPUP_CONSTANTS } from '../popup/common.js';
import {
    RuntimeMessenger,
    addRuntimeActionListener,
} from '../shared/runtimeMessaging.js';
import { DashboardTaskManager } from './tasks.js';
import { DashboardSettingsManager } from './settings.js';
import { DashboardStatisticsManager } from './statistics.js';

class DashboardApp {
    constructor() {
        this.messenger = new RuntimeMessenger({
            retryDelay: POPUP_CONSTANTS.RETRY_DELAY,
            fallbacks: { getState: POPUP_CONSTANTS.DEFAULT_STATE },
        });

        this.sections = {
            tasks: document.getElementById('dashboardTasksSection'),
            settings: document.getElementById('dashboardSettingsSection'),
            statistics: document.getElementById('dashboardStatisticsSection'),
        };

        this.navButtons = Array.from(
            document.querySelectorAll('.dashboard-nav__item')
        );

        this.state = {
            core: { ...POPUP_CONSTANTS.DEFAULT_STATE },
            history: {},
        };

        this.taskManager = new DashboardTaskManager({
            container: this.sections.tasks,
            messenger: this.messenger,
            onStateUpdate: (state) => this.updateCoreState(state),
            refreshState: () => this.fetchAndSyncState(),
        });

        this.settingsManager = new DashboardSettingsManager({
            container: this.sections.settings,
            messenger: this.messenger,
            onStateUpdate: (state) => this.updateCoreState(state),
        });

        this.statisticsManager = new DashboardStatisticsManager({
            container: this.sections.statistics,
            messenger: this.messenger,
            onRequestHistory: () => this.fetchStatisticsHistory(),
            onStateUpdate: (state) => this.updateCoreState(state),
        });

        this.unsubscribeRuntimeUpdates = null;
    }

    async init() {
        this.bindNavigation();
        this.taskManager.init();
        this.settingsManager.init();
        this.statisticsManager.init();

        await this.loadInitialData();
        this.registerRuntimeUpdates();
    }

    bindNavigation() {
        this.navButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const sectionKey = button.dataset.section;
                if (sectionKey) {
                    this.activateSection(sectionKey);
                }
            });
        });
    }

    activateSection(key) {
        this.navButtons.forEach((button) => {
            button.classList.toggle(
                'is-active',
                button.dataset.section === key
            );
        });

        Object.entries(this.sections).forEach(([sectionKey, element]) => {
            if (!element) {
                return;
            }
            const isActive = sectionKey === key;
            element.classList.toggle('is-active', isActive);
            if (isActive) {
                element.removeAttribute('hidden');
            } else {
                element.setAttribute('hidden', '');
            }
        });

        if (key === 'statistics') {
            this.statisticsManager.refreshHistory();
        } else if (key === 'tasks') {
            this.fetchAndSyncState();
        }
    }

    async loadInitialData() {
        await Promise.all([
            this.fetchAndSyncState({ silent: true }),
            this.fetchStatisticsHistory(),
        ]);
        this.renderAll();
    }

    async fetchAndSyncState(options = {}) {
        const { silent = false } = options;
        try {
            const state = await this.messenger.sendMessage('getState');
            this.updateCoreState(state, { silent });
            return state;
        } catch (error) {
            console.error('Failed to fetch state for dashboard', error);
            return this.state.core;
        }
    }

    async fetchStatisticsHistory() {
        try {
            const response = await this.messenger.sendMessage(
                'getStatisticsHistory',
                {},
                { fallbackValue: { success: true, history: {} } }
            );
            const history = response?.history || {};
            this.state.history = history;
            return history;
        } catch (error) {
            console.error('Failed to fetch statistics history', error);
            return this.state.history;
        }
    }

    registerRuntimeUpdates() {
        if (this.unsubscribeRuntimeUpdates) {
            this.unsubscribeRuntimeUpdates();
        }

        this.unsubscribeRuntimeUpdates = addRuntimeActionListener(
            'updateTimer',
            (request) => {
                if (request.state) {
                    this.updateCoreState(request.state, { silent: false });
                }
            }
        );
    }

    updateCoreState(state, options = {}) {
        if (!state) {
            return;
        }
        this.state.core = { ...state };
        if (!options.silent) {
            this.renderAll();
        }
    }

    renderAll() {
        this.taskManager.render(this.state.core);
        this.settingsManager.render(this.state.core.settings);
        this.statisticsManager.render({
            statistics: this.state.core.statistics || {
                completedToday: 0,
                focusTimeToday: 0,
            },
            history: this.state.history,
        });
    }
}

export async function initializeDashboard() {
    try {
        const app = new DashboardApp();
        await app.init();
    } catch (error) {
        console.error('Failed to initialise dashboard', error);
    }
}
