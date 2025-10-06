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

        Object.entries(this.sections).forEach(([key, element]) => {
            if (element) {
                element.dataset.sectionKey = key;
                element.removeAttribute('hidden');
            }
        });

        this.activeSection = null;
        this.handleHashChange = this.handleHashChange.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
        this.scrollUpdateFrame = null;

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
        this.applyInitialSectionFromHash();
        this.registerScrollSpy();
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
                    this.scrollToSection(sectionKey);
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

    scrollToSection(key, options = {}) {
        const section = this.sections[key];
        if (!section) {
            return;
        }

        const { behavior = 'smooth' } = options;

        try {
            section.scrollIntoView({ behavior, block: 'start' });
        } catch {
            section.scrollIntoView();
        }
    }

    registerScrollSpy() {
        this.updateActiveSectionFromScroll();
        window.addEventListener('scroll', this.handleScroll, { passive: true });
    }

    handleScroll() {
        if (this.scrollUpdateFrame) {
            return;
        }

        this.scrollUpdateFrame = window.requestAnimationFrame(() => {
            this.scrollUpdateFrame = null;
            this.updateActiveSectionFromScroll();
        });
    }

    updateActiveSectionFromScroll() {
        let closestKey = null;
        let smallestDistance = Number.POSITIVE_INFINITY;
        const viewportHeight = window.innerHeight || 0;

        Object.entries(this.sections).forEach(([key, element]) => {
            if (!element) {
                return;
            }

            const rect = element.getBoundingClientRect();
            const isVisible = rect.top < viewportHeight && rect.bottom > 0;
            if (!isVisible) {
                return;
            }

            const distance = Math.abs(rect.top);
            if (distance < smallestDistance) {
                smallestDistance = distance;
                closestKey = key;
            }
        });

        if (closestKey) {
            this.setActiveSection(closestKey);
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
            this.scrollToSection(key, { behavior: 'auto' });
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
