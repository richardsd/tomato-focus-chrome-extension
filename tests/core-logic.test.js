import { describe, expect, it } from 'vitest';

import {
    computeNextSessionOnComplete,
    computeSkipBreakState,
    getSessionDurationSeconds,
} from '../src/core/timerStateMachine.js';
import {
    buildTaskImports,
    sanitizeJiraSyncInterval,
    shouldRetryJiraSync,
} from '../src/core/jiraCore.js';
import {
    createTaskRecord,
    deleteTaskRecords,
    incrementTaskPomodoro,
} from '../src/core/tasksCore.js';
import { pruneStatisticsHistory } from '../src/core/statisticsCore.js';

describe('core timer state machine', () => {
    it('calculates next work session after break completion', () => {
        const next = computeNextSessionOnComplete({
            isWorkSession: false,
            currentSession: 1,
            settings: { workDuration: 25, autoStart: false },
        });

        expect(next).toMatchObject({
            isWorkSession: true,
            currentSession: 2,
            timeLeft: 1500,
            isRunning: false,
        });
    });

    it('calculates long break timing', () => {
        const seconds = getSessionDurationSeconds({
            isWorkSession: false,
            currentSession: 4,
            settings: { longBreakInterval: 4, longBreak: 15, shortBreak: 5 },
        });

        expect(seconds).toBe(900);
    });

    it('skips break by returning a work session state', () => {
        const skipped = computeSkipBreakState({
            isWorkSession: false,
            isRunning: false,
            currentSession: 2,
            settings: { workDuration: 25, autoStart: true },
        });

        expect(skipped).toMatchObject({
            isWorkSession: true,
            currentSession: 3,
            timeLeft: 1500,
            isRunning: true,
        });
    });
});

describe('core task and jira logic', () => {
    it('builds import list without title duplicates', () => {
        const imports = buildTaskImports(
            [
                { key: 'PROJ-1', title: 'My Task', description: '' },
                { key: 'PROJ-2', title: 'my task', description: '' },
                { key: 'PROJ-3', title: '', description: '' },
            ],
            [{ title: 'existing', id: '1' }]
        );

        expect(imports).toHaveLength(2);
        expect(imports[1].title).toBe('PROJ-3');
    });

    it('sanitizes jira sync interval and detects retryable failures', () => {
        expect(sanitizeJiraSyncInterval('1')).toBe(5);
        expect(sanitizeJiraSyncInterval('900')).toBe(720);
        expect(shouldRetryJiraSync({ status: 503 })).toBe(true);
        expect(
            shouldRetryJiraSync(new Error('Failed to connect to Jira'))
        ).toBe(true);
    });

    it('applies pure task transforms', () => {
        const task = createTaskRecord(
            { title: 'Write docs' },
            { idFactory: () => 'task-id' }
        );
        const incremented = incrementTaskPomodoro(task);
        const filtered = deleteTaskRecords([incremented], ['task-id']);

        expect(incremented.completedPomodoros).toBe(1);
        expect(filtered).toHaveLength(0);
    });
});

describe('core statistics logic', () => {
    it('prunes old statistics outside retention period', () => {
        const input = {
            '2024-01-01': { completedToday: 1, focusTimeToday: 25 },
            '2024-01-30': { completedToday: 2, focusTimeToday: 50 },
        };

        const pruned = pruneStatisticsHistory(
            input,
            10,
            new Date('2024-02-01')
        );

        expect(pruned).toEqual({
            '2024-01-30': { completedToday: 2, focusTimeToday: 50 },
        });
    });
});
