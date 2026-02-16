import { DEFAULT_SETTINGS } from './stateDefaults.js';

export function sanitizeJiraSyncInterval(value) {
    const interval =
        Number.parseInt(value, 10) || DEFAULT_SETTINGS.jiraSyncInterval;
    return Math.min(Math.max(interval, 5), 720);
}

export function buildJiraSearchRequest({ jiraUrl, jiraUsername, jiraToken }) {
    const base = jiraUrl.replace(/\/$/, '');
    const escapedUsername = jiraUsername.replace(/"/g, '\\"');
    const jql = `status in ("Open","In Progress","In Review","Verify") AND assignee = "${escapedUsername}" AND resolution = Unresolved`;
    const fields = 'key,summary,description';
    const search = `${base}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(fields)}`;
    const auth = btoa(`${jiraUsername}:${jiraToken}`);

    return {
        url: search,
        requestInit: {
            headers: {
                Authorization: `Basic ${auth}`,
                Accept: 'application/json',
            },
        },
    };
}

export function parseJiraDescription(rawDesc) {
    if (typeof rawDesc === 'string') {
        return rawDesc;
    }

    if (rawDesc && Array.isArray(rawDesc.content)) {
        return rawDesc.content
            .map((block) =>
                (block.content || [])
                    .map((content) => content.text || '')
                    .join('')
            )
            .join('\n');
    }

    return '';
}

export function mapIssueToTask(issue) {
    const fields = issue.fields || {};
    const summary = fields.summary || '';

    return {
        key: issue.key,
        title: summary,
        description: parseJiraDescription(fields.description),
    };
}

export function mapIssuesToTasks(issues = []) {
    return issues.map(mapIssueToTask);
}

export function buildTaskImports(issues, existingTasks) {
    const existingTitles = new Set(
        existingTasks.map((task) => (task.title || '').trim().toLowerCase())
    );

    const toCreate = [];
    for (const issue of issues) {
        const normalizedTitle = (issue.title || '').trim();
        const fallbackTitle = normalizedTitle || issue.key || 'Jira Task';
        const dedupeKey = fallbackTitle.toLowerCase();

        if (existingTitles.has(dedupeKey)) {
            continue;
        }

        toCreate.push({
            title: fallbackTitle,
            description: issue.description,
            estimatedPomodoros: 1,
        });
        existingTitles.add(dedupeKey);
    }

    return toCreate;
}

export function shouldRetryJiraSync(error) {
    if (!error) {
        return false;
    }

    const status = Number(error.status || error.code);
    if (Number.isFinite(status) && status >= 500) {
        return true;
    }

    const message = String(error.message || '').toLowerCase();
    return (
        message.includes('failed to connect') ||
        message.includes('network') ||
        message.includes('timeout')
    );
}
