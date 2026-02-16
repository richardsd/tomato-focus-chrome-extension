import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/shared/jiraPermissions.js', () => ({
    hasJiraPermission: vi.fn(),
}));

vi.mock('../src/background/jira.js', () => ({
    fetchAssignedIssues: vi.fn(),
}));

import { JiraSyncManager } from '../src/background/jiraSync.js';
import { TaskManager } from '../src/background/tasks.js';
import { fetchAssignedIssues } from '../src/background/jira.js';
import { hasJiraPermission } from '../src/shared/jiraPermissions.js';

describe('JiraSyncManager.configureAlarm', () => {
    let manager;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new JiraSyncManager({ alarmName: 'jira-auto-sync' });
        chrome.alarms.clear.mockImplementation((alarmName, callback) => {
            callback?.(true);
        });
    });

    it('always clears the existing alarm before evaluating settings', async () => {
        await manager.configureAlarm({ autoSyncJira: false });

        expect(chrome.alarms.clear).toHaveBeenCalledOnce();
        expect(chrome.alarms.clear).toHaveBeenCalledWith(
            'jira-auto-sync',
            expect.any(Function)
        );
        expect(chrome.alarms.create).not.toHaveBeenCalled();
    });

    it('skips alarm registration when Jira configuration is incomplete', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await manager.configureAlarm({
            autoSyncJira: true,
            jiraUrl: 'https://example.atlassian.net',
            jiraUsername: '',
            jiraToken: '',
            jiraSyncInterval: 30,
        });

        expect(hasJiraPermission).not.toHaveBeenCalled();
        expect(chrome.alarms.create).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
            'Jira auto-sync is enabled but configuration is incomplete. Skipping alarm registration.'
        );
    });

    it('skips alarm registration when Jira permission is not granted', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        hasJiraPermission.mockResolvedValue(false);

        await manager.configureAlarm({
            autoSyncJira: true,
            jiraUrl: 'https://example.atlassian.net',
            jiraUsername: 'dev@example.com',
            jiraToken: 'abc123',
            jiraSyncInterval: 30,
        });

        expect(hasJiraPermission).toHaveBeenCalledWith(
            'https://example.atlassian.net'
        );
        expect(chrome.alarms.create).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
            'Jira auto-sync is enabled but host permission is not granted. Skipping alarm registration.'
        );
    });

    it('clamps sync interval between 5 and 720 minutes', async () => {
        hasJiraPermission.mockResolvedValue(true);

        await manager.configureAlarm({
            autoSyncJira: true,
            jiraUrl: 'https://example.atlassian.net',
            jiraUsername: 'dev@example.com',
            jiraToken: 'abc123',
            jiraSyncInterval: 1,
        });

        expect(chrome.alarms.create).toHaveBeenNthCalledWith(
            1,
            'jira-auto-sync',
            {
                periodInMinutes: 5,
            }
        );

        await manager.configureAlarm({
            autoSyncJira: true,
            jiraUrl: 'https://example.atlassian.net',
            jiraUsername: 'dev@example.com',
            jiraToken: 'abc123',
            jiraSyncInterval: 10000,
        });

        expect(chrome.alarms.create).toHaveBeenNthCalledWith(
            2,
            'jira-auto-sync',
            {
                periodInMinutes: 720,
            }
        );
    });
});

describe('JiraSyncManager.performJiraSync', () => {
    let manager;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new JiraSyncManager({ alarmName: 'jira-auto-sync' });
    });

    it('throws when Jira permission is missing', async () => {
        hasJiraPermission.mockResolvedValue(false);

        await expect(
            manager.performJiraSync({
                jiraUrl: 'https://example.atlassian.net',
                jiraUsername: 'dev@example.com',
                jiraToken: 'abc123',
            })
        ).rejects.toThrow(
            'Jira permission not granted. Please enable Jira access in settings.'
        );

        expect(fetchAssignedIssues).not.toHaveBeenCalled();
    });

    it('dedupes tasks by normalized title and reports imported count with final task list', async () => {
        hasJiraPermission.mockResolvedValue(true);
        fetchAssignedIssues.mockResolvedValue({
            issues: [
                {
                    key: 'JIRA-1',
                    title: 'build api',
                    description: 'Duplicate of existing task',
                },
                {
                    key: 'JIRA-2',
                    title: ' Write tests ',
                    description: 'First unique issue',
                },
                {
                    key: 'JIRA-3',
                    title: 'write tests',
                    description: 'Duplicate within imported issues',
                },
                {
                    key: 'JIRA-4',
                    title: '',
                    description: 'Falls back to issue key',
                },
            ],
            totalIssues: 4,
            mappingErrors: [],
        });

        const tasks = [
            {
                id: 'existing-1',
                title: 'Build API',
                description: 'Already tracked',
            },
        ];

        vi.spyOn(TaskManager, 'getTasks').mockImplementation(async () => tasks);
        vi.spyOn(TaskManager, 'createTask').mockImplementation(async (task) => {
            const created = {
                id: `created-${tasks.length + 1}`,
                ...task,
            };
            tasks.push(created);
            return created;
        });

        const result = await manager.performJiraSync({
            jiraUrl: 'https://example.atlassian.net',
            jiraUsername: 'dev@example.com',
            jiraToken: 'abc123',
        });

        expect(hasJiraPermission).toHaveBeenCalledWith(
            'https://example.atlassian.net'
        );
        expect(fetchAssignedIssues).toHaveBeenCalledWith({
            jiraUrl: 'https://example.atlassian.net',
            jiraUsername: 'dev@example.com',
            jiraToken: 'abc123',
        });

        expect(TaskManager.createTask).toHaveBeenCalledTimes(2);
        expect(TaskManager.createTask).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                title: 'Write tests',
                description: 'First unique issue',
                estimatedPomodoros: 1,
            })
        );
        expect(TaskManager.createTask).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                title: 'JIRA-4',
                description: 'Falls back to issue key',
                estimatedPomodoros: 1,
            })
        );

        expect(result.importedCount).toBe(2);
        expect(result.totalIssues).toBe(4);
        expect(result.tasks).toEqual(tasks);
        expect(result.tasks.map((task) => task.title)).toEqual([
            'Build API',
            'Write tests',
            'JIRA-4',
        ]);
    });
});
