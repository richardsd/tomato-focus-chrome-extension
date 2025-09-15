export async function fetchAssignedIssues(settings) {
    const { jiraUrl, jiraUsername, jiraToken } = settings || {};
    if (!jiraUrl || !jiraUsername || !jiraToken) {
        throw new Error('Missing Jira configuration');
    }

    const base = jiraUrl.replace(/\/$/, '');
    const search = `${base}/rest/api/3/search?jql=assignee=%22${encodeURIComponent(jiraUsername)}%22%20AND%20resolution=Unresolved`;
    const auth = btoa(`${jiraUsername}:${jiraToken}`);

    const response = await fetch(search, {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`Jira request failed: ${response.status}`);
    }
    const data = await response.json();
    const issues = data.issues || [];
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
        return { title: summary, description };
    });
}
