import { CONSTANTS } from './constants.js';
import { ensureAccessToken } from './jiraAuth.js';

function buildJql() {
    return 'status in ("Open","In Progress","In Review","Verify") AND assignee = currentUser() AND resolution = Unresolved';
}

function buildSearchUrl(cloudId) {
    const base = `${CONSTANTS.ATLASSIAN_AUTH.API_BASE_URL}/ex/jira/${cloudId}/rest/api/3/search`;
    const params = new URLSearchParams({ jql: buildJql() });
    return `${base}?${params.toString()}`;
}

function mapIssues(data) {
    const issues = Array.isArray(data?.issues) ? data.issues : [];
    return issues.map(issue => {
        const fields = issue.fields || {};
        const summary = fields.summary || '';
        let description = '';
        const rawDesc = fields.description;
        if (typeof rawDesc === 'string') {
            description = rawDesc;
        } else if (rawDesc && Array.isArray(rawDesc.content)) {
            description = rawDesc.content.map(block =>
                (block.content || []).map(c => c.text || '').join('')
            ).join('\n');
        }

        return {
            key: issue.key,
            title: summary,
            description
        };
    });
}

async function executeSearch(url, accessToken) {
    try {
        return await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });
    } catch (error) {
        throw new Error(`Failed to connect to Jira: ${error.message}`);
    }
}

export async function fetchAssignedIssues(settings = {}) {
    const { jiraCloudId, jiraOAuth } = settings;
    if (!jiraCloudId || !jiraOAuth) {
        throw new Error('Missing Jira authentication. Connect to Jira from the settings panel.');
    }

    let tokenResult;
    try {
        tokenResult = await ensureAccessToken(jiraOAuth);
    } catch (error) {
        throw new Error(`Jira authentication failed: ${error.message}`);
    }

    let { auth: authState, accessToken } = tokenResult;
    const searchUrl = buildSearchUrl(jiraCloudId);

    let response = await executeSearch(searchUrl, accessToken);
    if (response.status === 401) {
        try {
            const refreshed = await ensureAccessToken(authState, { forceRefresh: true });
            authState = refreshed.auth;
            accessToken = refreshed.accessToken;
        } catch (refreshError) {
            throw new Error(`Jira authentication expired. Please reconnect. (${refreshError.message})`);
        }

        response = await executeSearch(searchUrl, accessToken);
        if (response.status === 401) {
            throw new Error('Jira rejected the request. Please reconnect the integration.');
        }
    }

    if (!response.ok) {
        throw new Error(`Jira request failed: ${response.status} ${response.statusText || ''}`.trim());
    }

    let data;
    try {
        data = await response.json();
    } catch (error) {
        throw new Error('Jira response was not valid JSON');
    }

    return {
        issues: mapIssues(data),
        authState
    };
}
