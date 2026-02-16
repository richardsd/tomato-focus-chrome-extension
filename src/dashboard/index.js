import { DEFAULT_STATE, RETRY_DELAY } from '../shared/uiConstants.js';
import {
    RuntimeMessenger,
    addRuntimeActionListener,
} from '../shared/runtimeMessaging.js';
import { ACTIONS } from '../shared/runtimeActions.js';
import { DashboardTaskManager } from './tasks.js';
import { DashboardSettingsManager } from './settings.js';
import { DashboardStatisticsManager } from './statistics.js';

export class DashboardToastManager {
    constructor(container) {
        this.container = container;
        this.activeToasts = new Set();
    }

    show(message, options = {}) {
        if (!this.container || !message) {
            return;
        }
        const { variant = 'success', timeout = 4000 } = options;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.dataset.variant = variant;
        toast.textContent = message;
        this.container.appendChild(toast);
        this.activeToasts.add(toast);

        window.setTimeout(() => {
            this.dismiss(toast);
        }, timeout);
    }

    dismiss(toast) {
        if (!toast || !this.activeToasts.has(toast)) {
            return;
        }
        this.activeToasts.delete(toast);
        toast.classList.add('is-leaving');
        window.setTimeout(() => {
            toast.remove();
        }, 150);
    }
}

export class DashboardApp {
    constructor() {
        this.messenger = new RuntimeMessenger({
            retryDelay: RETRY_DELAY,
            fallbacks: { [ACTIONS.GET_STATE]: DEFAULT_STATE },
        });

        this.sections = {
            tasks: document.getElementById('dashboardTasksSection'),
            statistics: document.getElementById('dashboardStatisticsSection'),
            settings: document.getElementById('dashboardSettingsSection'),
        };

        this.navButtons = Array.from(
            document.querySelectorAll('.dashboard-nav__item')
        );

        this.toastManager = new DashboardToastManager(
            document.getElementById('dashboardToasts')
        );

        Object.entries(this.sections).forEach(([key, element]) => {
            if (element) {
                element.dataset.sectionKey = key;
                element.removeAttribute('hidden');
            }
        });

        this.activeSection = null;
        this.handleHashChange = this.handleHashChange.bind(this);
        this.state = {
            core: { ...DEFAULT_STATE },
            history: {},
        };

        this.taskManager = new DashboardTaskManager({
            container: this.sections.tasks,
            messenger: this.messenger,
            onStateUpdate: (state) => this.updateCoreState(state),
            refreshState: () => this.fetchAndSyncState(),
            toastManager: this.toastManager,
        });

        this.settingsManager = new DashboardSettingsManager({
            container: this.sections.settings,
            messenger: this.messenger,
            onStateUpdate: (state) => this.updateCoreState(state),
            toastManager: this.toastManager,
        });

        this.statisticsManager = new DashboardStatisticsManager({
            container: this.sections.statistics,
            messenger: this.messenger,
            onRequestHistory: () => this.fetchStatisticsHistory(),
            onStateUpdate: (state) => this.updateCoreState(state),
            toastManager: this.toastManager,
        });

        this.unsubscribeRuntimeUpdates = null;
    }

    async init() {
        this.bindNavigation();
        this.applyInitialSectionFromHash();
        window.addEventListener('hashchange', this.handleHashChange);
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
                    this.setActiveSection(sectionKey);
                }
            });
        });
    }

    setActiveSection(key, options = {}) {
        if (!this.sections[key] || this.activeSection === key) {
            return;
        }

        const previousSection = this.activeSection;
        this.activeSection = key;

        this.navButtons.forEach((button) => {
            button.classList.toggle(
                'is-active',
                button.dataset.section === key
            );
            if (button.dataset.section === key) {
                button.setAttribute('aria-current', 'page');
            } else {
                button.removeAttribute('aria-current');
            }
        });

        Object.entries(this.sections).forEach(([sectionKey, element]) => {
            if (!element) {
                return;
            }
            const isActive = sectionKey === key;
            element.classList.toggle('is-active', isActive);
            element.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });

        if (!options.skipHashUpdate) {
            this.updateHashForSection(key);
        }

        if (key === 'statistics') {
            this.statisticsManager.refreshHistory();
        } else if (key === 'tasks' && previousSection !== 'tasks') {
            this.fetchAndSyncState();
        }
    }

    updateHashForSection(key) {
        const targetHash = `#${key}`;
        if (window.location.hash === targetHash) {
            return;
        }
        try {
            window.history.replaceState(null, '', targetHash);
        } catch {
            window.location.hash = targetHash;
        }
    }

    applyInitialSectionFromHash() {
        const key = this.getSectionKeyFromHash(window.location.hash);
        if (key) {
            this.setActiveSection(key);
            return;
        }
        this.setActiveSection('tasks');
    }

    getSectionKeyFromHash(hash) {
        if (!hash) {
            return null;
        }
        const key = hash.replace(/^#/, '');
        return this.sections[key] ? key : null;
    }

    handleHashChange() {
        const key = this.getSectionKeyFromHash(window.location.hash);
        if (key) {
            this.setActiveSection(key, { skipHashUpdate: true });
            this.scrollToSection(key);
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
            const state = await this.messenger.sendMessage(ACTIONS.GET_STATE);
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
                ACTIONS.GET_STATISTICS_HISTORY,
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
            ACTIONS.UPDATE_TIMER,
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
