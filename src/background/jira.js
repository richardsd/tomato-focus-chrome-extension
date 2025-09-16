function parseProjects(jiraProjects) {
    if (!jiraProjects) {
        return [];
    }

    const projects = Array.isArray(jiraProjects)
        ? jiraProjects
        : String(jiraProjects).split(',');

    const normalized = projects
        .map(project => project && project.toString().trim())
        .filter(Boolean)
        .map(project => project.toUpperCase().replace(/"/g, '\\"'));

    return Array.from(new Set(normalized));
}

export async function fetchAssignedIssues(settings) {
    const { jiraUrl, jiraUsername, jiraToken, jiraProjects } = settings || {};
    if (!jiraUrl || !jiraUsername || !jiraToken) {
        throw new Error('Missing Jira configuration');
    }

    const base = jiraUrl.replace(/\/$/, '');
    const escapedUsername = jiraUsername.replace(/"/g, '\\"');
    const projects = parseProjects(jiraProjects);
    let jql = `status in ("Open","In Progress","Review","Verify") AND assignee = "${escapedUsername}" AND resolution = Unresolved`;
    if (projects.length > 0) {
        const projectClause = projects.map(key => `"${key}"`).join(',');
        jql += ` AND project in (${projectClause})`;
    }
    const search = `${base}/rest/api/3/search?jql=${encodeURIComponent(jql)}`;
    const auth = btoa(`${jiraUsername}:${jiraToken}`);

    let response;
    try {
        response = await fetch(search, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json'
            }
        });
    } catch (error) {
        throw new Error(`Failed to connect to Jira: ${error.message}`);
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
        return { key: issue.key, title: summary, description };
    });
}
