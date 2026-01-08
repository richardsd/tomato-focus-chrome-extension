export function getJiraPermissionOrigin(jiraUrl) {
    if (!jiraUrl) {
        return null;
    }
    try {
        const parsed = new URL(jiraUrl);
        return `${parsed.origin}/*`;
    } catch (error) {
        console.warn('Unable to parse Jira URL for permissions:', error);
        return null;
    }
}

export async function hasJiraPermission(jiraUrl) {
    const origin = getJiraPermissionOrigin(jiraUrl);
    if (!origin) {
        return false;
    }
    return chrome.permissions.contains({ origins: [origin] });
}

async function requestJiraPermissionForUrl(jiraUrl) {
    const origin = getJiraPermissionOrigin(jiraUrl);
    if (!origin) {
        return false;
    }
    const hasPermission = await chrome.permissions.contains({
        origins: [origin],
    });
    if (hasPermission) {
        return true;
    }
    return chrome.permissions.request({ origins: [origin] });
}

export async function requestJiraPermission(jiraInput) {
    if (jiraInput && typeof jiraInput === 'object' && 'jiraUrl' in jiraInput) {
        const { jiraUrl, jiraUsername, jiraToken } = jiraInput;
        if (!jiraUrl || !jiraUsername || !jiraToken) {
            return true;
        }
        return requestJiraPermissionForUrl(jiraUrl);
    }

    return requestJiraPermissionForUrl(jiraInput);
}
