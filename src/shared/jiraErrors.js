export const JiraErrorCodes = {
    CONFIGURATION: 'JIRA_CONFIGURATION_ERROR',
    AUTH: 'JIRA_AUTH_ERROR',
    NETWORK: 'JIRA_NETWORK_ERROR',
    TIMEOUT: 'JIRA_TIMEOUT_ERROR',
    RESPONSE: 'JIRA_RESPONSE_ERROR',
};

export function formatJiraSyncFailure(error) {
    const code = error?.code;

    if (code === JiraErrorCodes.AUTH) {
        return 'Jira authentication failed. Check your Jira URL, username, and API token.';
    }

    if (code === JiraErrorCodes.NETWORK || code === JiraErrorCodes.TIMEOUT) {
        return 'Jira sync failed due to a network or timeout issue. Check your connection and try again.';
    }

    if (code === JiraErrorCodes.CONFIGURATION) {
        return error?.message || 'Jira configuration is incomplete.';
    }

    return `Jira sync failed: ${error?.message || 'Unknown error'}`;
}
