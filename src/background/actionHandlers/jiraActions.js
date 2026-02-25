import { ACTIONS } from '../../shared/runtimeActions.js';
import { getSuccessStateResponse } from './common.js';

export function createJiraActionHandlers(controller) {
    return {
        [ACTIONS.IMPORT_JIRA_TASKS]: async () => {
            try {
                const result = await controller.performJiraSync();
                return getSuccessStateResponse(controller, {
                    importedCount: result.importedCount,
                    totalIssues: result.totalIssues,
                });
            } catch (error) {
                console.error('Failed to import Jira tasks:', error);
                return { error: error.message };
            }
        },
    };
}
