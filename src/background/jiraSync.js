import { DEFAULT_SETTINGS } from '../shared/stateDefaults.js';
import { hasJiraPermission } from '../shared/jiraPermissions.js';
import { fetchAssignedIssues } from './jira.js';
import { TaskManager } from './tasks.js';

export class JiraSyncManager {
    constructor({ alarmName }) {
        this.alarmName = alarmName;
    }

    async configureAlarm(settings) {
        await new Promise((resolve) =>
            chrome.alarms.clear(this.alarmName, resolve)
        );

        const {
            autoSyncJira,
            jiraSyncInterval,
            jiraUrl,
            jiraUsername,
            jiraToken,
        } = settings || {};

        if (!autoSyncJira) {
            return;
        }

        if (!jiraUrl || !jiraUsername || !jiraToken) {
            console.warn(
                'Jira auto-sync is enabled but configuration is incomplete. Skipping alarm registration.'
            );
            return;
        }

        const hasPermission = await hasJiraPermission(jiraUrl);
        if (!hasPermission) {
            console.warn(
                'Jira auto-sync is enabled but host permission is not granted. Skipping alarm registration.'
            );
            return;
        }

        const interval =
            Number.parseInt(jiraSyncInterval, 10) ||
            DEFAULT_SETTINGS.jiraSyncInterval;
        const sanitizedInterval = Math.min(Math.max(interval, 5), 720);
        chrome.alarms.create(this.alarmName, {
            periodInMinutes: sanitizedInterval,
        });
    }

    async performJiraSync(settings) {
        const { jiraUrl, jiraUsername, jiraToken } = settings || {};
        const hasPermission = await hasJiraPermission(jiraUrl);
        if (!hasPermission) {
            throw new Error(
                'Jira permission not granted. Please enable Jira access in settings.'
            );
        }

        const issues = await fetchAssignedIssues({
            jiraUrl,
            jiraUsername,
            jiraToken,
        });
        const existingTasks = await TaskManager.getTasks();
        const existingTitles = new Set(
            existingTasks.map((task) => (task.title || '').trim().toLowerCase())
        );
        let createdCount = 0;

        for (const issue of issues) {
            const normalizedTitle = (issue.title || '').trim();
            const fallbackTitle = normalizedTitle || issue.key || 'Jira Task';
            const dedupeKey = fallbackTitle.toLowerCase();

            if (existingTitles.has(dedupeKey)) {
                continue;
            }

            await TaskManager.createTask({
                title: fallbackTitle,
                description: issue.description,
                estimatedPomodoros: 1,
            });
            existingTitles.add(dedupeKey);
            createdCount++;
        }

        const tasks = await TaskManager.getTasks();

        return {
            importedCount: createdCount,
            totalIssues: issues.length,
            tasks,
        };
    }
}
