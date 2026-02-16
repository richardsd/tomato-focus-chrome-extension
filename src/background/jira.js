import { validateJiraUrl } from '../shared/jiraUrlValidator.js';
import { buildJiraSearchRequest, mapIssuesToTasks } from '../core/jiraCore.js';

export async function fetchAssignedIssues(settings) {
    const { jiraUrl, jiraUsername, jiraToken } = settings || {};
    if (!jiraUrl || !jiraUsername || !jiraToken) {
        throw new Error('Missing Jira configuration');
    }
    const { isValid, message } = validateJiraUrl(jiraUrl);
    if (!isValid) {
        throw new Error(message);
    }

    const request = buildJiraSearchRequest({
        jiraUrl,
        jiraUsername,
        jiraToken,
    });

    let response;
    try {
        response = await fetch(request.url, request.requestInit);
    } catch (error) {
        throw new Error(`Failed to connect to Jira: ${error.message}`);
    }

    if (!response.ok) {
        const err = new Error(
            `Jira request failed: ${response.status} ${response.statusText || ''}`.trim()
        );
        err.status = response.status;
        throw err;
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error('Jira response was not valid JSON');
    }

    return mapIssuesToTasks(data.issues || []);
}
