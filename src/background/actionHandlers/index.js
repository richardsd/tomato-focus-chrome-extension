import { createTimerActionHandlers } from './timerActions.js';
import { createSettingsActionHandlers } from './settingsActions.js';
import { createTaskActionHandlers } from './taskActions.js';
import { createJiraActionHandlers } from './jiraActions.js';
import { createStatisticsActionHandlers } from './statisticsActions.js';

export function createActionHandlers(controller) {
    return {
        ...createTimerActionHandlers(controller),
        ...createSettingsActionHandlers(controller),
        ...createTaskActionHandlers(controller),
        ...createJiraActionHandlers(controller),
        ...createStatisticsActionHandlers(controller),
    };
}
