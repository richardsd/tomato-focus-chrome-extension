import { validateJiraUrl } from '../shared/jiraUrlValidator.js';
import { buildJiraSearchRequest, mapIssuesToTasks } from '../core/jiraCore.js';
import { JiraErrorCodes } from '../shared/jiraErrors.js';

const JIRA_REQUEST_TIMEOUT_MS = 15000;

function createJiraError(message, code, extras = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, extras);
    return error;
}

function classifyHttpError(response) {
    if (response.status === 401 || response.status === 403) {
        return createJiraError(
            'Jira authentication failed. Verify your URL, username, and API token.',
            JiraErrorCodes.AUTH,
            { status: response.status }
        );
    }

    return createJiraError(
        `Jira request failed: ${response.status} ${response.statusText || ''}`.trim(),
        JiraErrorCodes.RESPONSE,
        { status: response.status }
    );
}

function collectMappingErrors(issues = []) {
    const mappingErrors = [];

    issues.forEach((issue, index) => {
        const hasKey = typeof issue?.key === 'string' && issue.key.trim();
        const hasSummary =
            typeof issue?.fields?.summary === 'string' &&
            issue.fields.summary.trim();

        if (!hasKey && !hasSummary) {
            mappingErrors.push({
                index,
                reason: 'Missing issue key and summary',
            });
        }
    });

    return mappingErrors;
}

export async function fetchAssignedIssues(settings) {
    const { jiraUrl, jiraUsername, jiraToken } = settings || {};
    if (!jiraUrl || !jiraUsername || !jiraToken) {
        throw createJiraError(
            'Missing Jira configuration',
            JiraErrorCodes.CONFIGURATION
        );
    }
    const { isValid, message } = validateJiraUrl(jiraUrl);
    if (!isValid) {
        throw createJiraError(message, JiraErrorCodes.CONFIGURATION);
    }

    const request = buildJiraSearchRequest({
        jiraUrl,
        jiraUsername,
        jiraToken,
    });

    const AbortControllerImpl = globalThis.AbortController;
    const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
    const timeoutId = setTimeout(() => {
        controller?.abort();
    }, JIRA_REQUEST_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(request.url, {
            ...request.requestInit,
            signal: controller?.signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw createJiraError(
                'Jira request timed out. Please try again.',
                JiraErrorCodes.TIMEOUT
            );
        }

        throw createJiraError(
            `Failed to connect to Jira: ${error.message}`,
            JiraErrorCodes.NETWORK
        );
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw classifyHttpError(response);
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw createJiraError(
            'Jira response was not valid JSON',
            JiraErrorCodes.RESPONSE
        );
    }

    const issues = Array.isArray(data.issues) ? data.issues : [];

    return {
        issues: mapIssuesToTasks(issues),
        totalIssues: issues.length,
        mappingErrors: collectMappingErrors(issues),
    };
}
