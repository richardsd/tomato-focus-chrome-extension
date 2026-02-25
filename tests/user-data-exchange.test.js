import { describe, expect, it } from 'vitest';

import {
    exportUserDataSchema,
    USER_DATA_SCHEMA_ID,
    USER_DATA_SCHEMA_VERSION,
} from '../src/core/userDataExchange.js';

describe('user data exchange export', () => {
    it('exports a versioned schema envelope', () => {
        const exported = exportUserDataSchema(
            {
                isRunning: true,
                timeLeft: 120,
                endTime: 1700000000000,
                currentSession: 3,
                isWorkSession: false,
                currentTaskId: 'abc',
                settings: { workDuration: 30, theme: 'dark' },
                tasks: [{ id: 'abc', title: 'Task 1', estimatedPomodoros: 2 }],
                statistics: {
                    '2026-01-01': { completedToday: 2, focusTimeToday: 50 },
                },
                uiPreferences: { hideCompleted: true },
            },
            { exportedAt: new Date('2026-01-10T00:00:00.000Z') }
        );

        expect(exported.schemaId).toBe(USER_DATA_SCHEMA_ID);
        expect(exported.schemaVersion).toBe(USER_DATA_SCHEMA_VERSION);
        expect(exported.conflictPolicy).toBe('sourceFileReplacesLocal');
        expect(exported.exportedAt).toBe('2026-01-10T00:00:00.000Z');
        expect(exported.data.timer).toEqual({
            isRunning: true,
            timeLeft: 120,
            endTime: 1700000000000,
            currentSession: 3,
            isWorkSession: false,
        });
        expect(exported.data.tasks[0]).toMatchObject({
            id: 'abc',
            title: 'Task 1',
            estimatedPomodoros: 2,
        });
    });

    it('normalizes malformed data into safe defaults', () => {
        const exported = exportUserDataSchema({
            settings: { volume: 'not-a-number' },
            tasks: 'nope',
            statistics: null,
            timeLeft: -20,
        });

        expect(exported.data.settings.volume).toBe(0.7);
        expect(exported.data.tasks).toEqual([]);
        expect(exported.data.statistics).toEqual({});
        expect(exported.data.timer.timeLeft).toBe(0);
    });
});
