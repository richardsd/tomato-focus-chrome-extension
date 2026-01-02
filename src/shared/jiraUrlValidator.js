const JIRA_DOMAIN_PATTERNS = [/\.atlassian\.net$/i, /\.jira\.com$/i];

export const JIRA_URL_ERROR_MESSAGE =
    'Jira URL must be an https://<your-domain>.atlassian.net or https://<your-domain>.jira.com URL.';

export function validateJiraUrl(url) {
    if (!url) {
        return { isValid: false, message: JIRA_URL_ERROR_MESSAGE };
    }

    try {
        const parsed = new window.URL(url);
        if (parsed.protocol !== 'https:') {
            return { isValid: false, message: JIRA_URL_ERROR_MESSAGE };
        }
        const hostname = parsed.hostname || '';
        const matchesPattern = JIRA_DOMAIN_PATTERNS.some((pattern) =>
            pattern.test(hostname)
        );
        if (!matchesPattern) {
            return { isValid: false, message: JIRA_URL_ERROR_MESSAGE };
        }
    } catch {
        return { isValid: false, message: JIRA_URL_ERROR_MESSAGE };
    }

    return { isValid: true, message: '' };
}

export function isValidJiraUrl(url) {
    return validateJiraUrl(url).isValid;
}
