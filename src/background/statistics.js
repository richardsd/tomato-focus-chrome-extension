import { CONSTANTS, chromePromise } from './constants.js';

export class StatisticsManager {
    static getTodayKey() {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    static async getStatistics() {
        try {
            const result = await chromePromise.storage.local.get([
                CONSTANTS.STATISTICS_KEY,
            ]);
            const allStats = result[CONSTANTS.STATISTICS_KEY] || {};
            const todayKey = this.getTodayKey();

            // Return today's statistics, initializing if needed
            return (
                allStats[todayKey] || {
                    completedToday: 0,
                    focusTimeToday: 0,
                }
            );
        } catch (error) {
            console.error('Failed to load statistics:', error);
            return {
                completedToday: 0,
                focusTimeToday: 0,
            };
        }
    }

    static async saveStatistics(todayStats) {
        try {
            const result = await chromePromise.storage.local.get([
                CONSTANTS.STATISTICS_KEY,
            ]);
            const allStats = result[CONSTANTS.STATISTICS_KEY] || {};
            const todayKey = this.getTodayKey();

            allStats[todayKey] = todayStats;

            // Clean up old statistics (keep only last 30 days)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);

            Object.keys(allStats).forEach((dateKey) => {
                const statDate = new Date(dateKey);
                if (statDate < cutoffDate) {
                    delete allStats[dateKey];
                }
            });

            await chromePromise.storage.local.set({
                [CONSTANTS.STATISTICS_KEY]: allStats,
            });
        } catch (error) {
            console.error('Failed to save statistics:', error);
        }
    }

    static async incrementCompleted() {
        const stats = await this.getStatistics();
        stats.completedToday++;
        await this.saveStatistics(stats);
        return stats;
    }

    static async addFocusTime(minutes) {
        const stats = await this.getStatistics();
        stats.focusTimeToday += minutes;
        await this.saveStatistics(stats);
        return stats;
    }

    static async clearAll() {
        try {
            await chromePromise.storage.local.set({
                [CONSTANTS.STATISTICS_KEY]: {},
            });
            console.log('All statistics data cleared');
        } catch (error) {
            console.error('Failed to clear statistics data:', error);
            throw error;
        }
    }

    static async getAllStatistics() {
        try {
            const result = await chromePromise.storage.local.get([
                CONSTANTS.STATISTICS_KEY,
            ]);
            return result[CONSTANTS.STATISTICS_KEY] || {};
        } catch (e) {
            console.error('Failed to get all statistics map', e);
            return {};
        }
    }
}
