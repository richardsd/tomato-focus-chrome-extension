import { CONSTANTS } from './constants.js';
import { createChromeStorageAdapter } from './adapters/chromeAdapters.js';
import {
    createEmptyDailyStatistics,
    getDateKey,
    getTodayStatistics,
    pruneStatisticsHistory,
    withCompletedIncrement,
    withFocusTimeAdded,
} from '../core/statisticsCore.js';

export class StatisticsManager {
    static storage = createChromeStorageAdapter();

    static getTodayKey() {
        return getDateKey(new Date());
    }

    static async getStatistics() {
        try {
            const result = await this.storage.get([CONSTANTS.STATISTICS_KEY]);
            const allStats = result[CONSTANTS.STATISTICS_KEY] || {};
            return getTodayStatistics(allStats, new Date());
        } catch (error) {
            console.error('Failed to load statistics:', error);
            return createEmptyDailyStatistics();
        }
    }

    static async saveStatistics(todayStats) {
        try {
            const result = await this.storage.get([CONSTANTS.STATISTICS_KEY]);
            const allStats = result[CONSTANTS.STATISTICS_KEY] || {};
            const todayKey = this.getTodayKey();

            const merged = {
                ...allStats,
                [todayKey]: todayStats,
            };
            const pruned = pruneStatisticsHistory(merged, 30, new Date());

            await this.storage.set({
                [CONSTANTS.STATISTICS_KEY]: pruned,
            });
        } catch (error) {
            console.error('Failed to save statistics:', error);
        }
    }

    static async incrementCompleted() {
        const stats = await this.getStatistics();
        const next = withCompletedIncrement(stats);
        await this.saveStatistics(next);
        return next;
    }

    static async addFocusTime(minutes) {
        const stats = await this.getStatistics();
        const next = withFocusTimeAdded(stats, minutes);
        await this.saveStatistics(next);
        return next;
    }

    static async clearAll() {
        try {
            await this.storage.set({ [CONSTANTS.STATISTICS_KEY]: {} });
            console.log('All statistics data cleared');
        } catch (error) {
            console.error('Failed to clear statistics data:', error);
            throw error;
        }
    }

    static async getAllStatistics() {
        try {
            const result = await this.storage.get([CONSTANTS.STATISTICS_KEY]);
            return result[CONSTANTS.STATISTICS_KEY] || {};
        } catch (e) {
            console.error('Failed to get all statistics map', e);
            return {};
        }
    }
}
