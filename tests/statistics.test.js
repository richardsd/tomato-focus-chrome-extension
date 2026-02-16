import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONSTANTS } from '../src/background/constants.js';
import { StatisticsManager } from '../src/background/statistics.js';

describe('StatisticsManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('getTodayKey returns YYYY-MM-DD format', () => {
        vi.setSystemTime(new Date('2025-02-05T09:30:00.000Z'));

        const todayKey = StatisticsManager.getTodayKey();

        expect(todayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(todayKey).toBe('2025-02-05');
    });

    it('getStatistics initializes with default values when data is missing', async () => {
        await expect(StatisticsManager.getStatistics()).resolves.toEqual({
            completedToday: 0,
            focusTimeToday: 0,
        });
    });

    it('saveStatistics stores today stats and prunes entries older than 30 days', async () => {
        vi.setSystemTime(new Date('2025-02-15T12:00:00.000Z'));

        chrome.storage.local.set({
            [CONSTANTS.STATISTICS_KEY]: {
                '2025-01-10': { completedToday: 1, focusTimeToday: 10 },
                '2025-02-01': { completedToday: 2, focusTimeToday: 20 },
            },
        });

        await StatisticsManager.saveStatistics({
            completedToday: 3,
            focusTimeToday: 30,
        });

        const allStats = await StatisticsManager.getAllStatistics();

        expect(allStats).toEqual({
            '2025-02-01': { completedToday: 2, focusTimeToday: 20 },
            '2025-02-15': { completedToday: 3, focusTimeToday: 30 },
        });
    });

    it('incrementCompleted and addFocusTime update and persist today values', async () => {
        vi.setSystemTime(new Date('2025-02-15T12:00:00.000Z'));

        chrome.storage.local.set({
            [CONSTANTS.STATISTICS_KEY]: {
                '2025-02-15': { completedToday: 1, focusTimeToday: 20 },
            },
        });

        await expect(StatisticsManager.incrementCompleted()).resolves.toEqual({
            completedToday: 2,
            focusTimeToday: 20,
        });

        await expect(StatisticsManager.addFocusTime(15)).resolves.toEqual({
            completedToday: 2,
            focusTimeToday: 35,
        });

        await expect(StatisticsManager.getStatistics()).resolves.toEqual({
            completedToday: 2,
            focusTimeToday: 35,
        });
    });

    it('clearAll removes all saved statistics', async () => {
        chrome.storage.local.set({
            [CONSTANTS.STATISTICS_KEY]: {
                '2025-02-15': { completedToday: 3, focusTimeToday: 30 },
            },
        });

        await StatisticsManager.clearAll();

        await expect(StatisticsManager.getAllStatistics()).resolves.toEqual({});
    });

    it('getAllStatistics returns empty object when storage read fails', async () => {
        const error = new Error('storage read failed');
        vi.spyOn(StatisticsManager.storage, 'get').mockRejectedValueOnce(error);
        const consoleErrorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        await expect(StatisticsManager.getAllStatistics()).resolves.toEqual({});
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to get all statistics map',
            error
        );
    });
});
