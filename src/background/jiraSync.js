import { hasJiraPermission } from '../shared/jiraPermissions.js';
import {
    buildTaskImports,
    sanitizeJiraSyncInterval,
    shouldRetryJiraSync,
} from '../core/jiraCore.js';
import { fetchAssignedIssues } from './jira.js';
import { JiraErrorCodes } from '../shared/jiraErrors.js';
import { TaskManager } from './tasks.js';
import { createChromeSchedulerAdapter } from './adapters/chromeAdapters.js';

export class JiraSyncManager {
    constructor({ alarmName, scheduler = createChromeSchedulerAdapter() }) {
        this.alarmName = alarmName;
        this.scheduler = scheduler;
    }

    async configureAlarm(settings) {
        await this.scheduler.clear(this.alarmName);

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

        await this.scheduler.create(this.alarmName, {
            periodInMinutes: sanitizeJiraSyncInterval(jiraSyncInterval),
        });
    }

    async performJiraSync(settings) {
        const { jiraUrl, jiraUsername, jiraToken } = settings || {};

        if (!jiraUrl || !jiraUsername || !jiraToken) {
            const missingConfigurationError = new Error(
                'Missing Jira configuration. Enter Jira URL, username, and API token before syncing.'
            );
            missingConfigurationError.code = JiraErrorCodes.CONFIGURATION;
            throw missingConfigurationError;
        }

        const hasPermission = await hasJiraPermission(jiraUrl);
        if (!hasPermission) {
            const permissionError = new Error(
                'Jira permission not granted. Please enable Jira access in settings.'
            );
            permissionError.code = JiraErrorCodes.CONFIGURATION;
            throw permissionError;
        }

        let issuesPayload;
        try {
            issuesPayload = await fetchAssignedIssues({
                jiraUrl,
                jiraUsername,
                jiraToken,
            });
        } catch (error) {
            if (shouldRetryJiraSync(error)) {
                issuesPayload = await fetchAssignedIssues({
                    jiraUrl,
                    jiraUsername,
                    jiraToken,
                });
            } else {
                throw error;
            }
        }

        const { issues, totalIssues, mappingErrors } = issuesPayload;

        const existingTasks = await TaskManager.getTasks();
        const toCreate = buildTaskImports(issues, existingTasks);

        for (const taskInput of toCreate) {
            await TaskManager.createTask(taskInput);
        }

        const tasks = await TaskManager.getTasks();

        return {
            importedCount: toCreate.length,
            totalIssues,
            mappingErrorCount: mappingErrors.length,
            tasks,
        };
    }
}
