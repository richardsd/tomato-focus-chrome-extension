import { StatisticsManager } from '../statistics.js';
import { NotificationManager } from '../notifications.js';
import { ACTIONS } from '../../shared/runtimeActions.js';
import { getSuccessStateResponse } from './common.js';

export function createStatisticsActionHandlers(controller) {
    return {
        [ACTIONS.CLEAR_STATISTICS]: async () => {
            await StatisticsManager.clearAll();
            await controller.loadStatistics();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.GET_STATISTICS_HISTORY]: async () => {
            const history = await StatisticsManager.getAllStatistics();
            return { success: true, history };
        },
        [ACTIONS.CHECK_NOTIFICATIONS]: async () => {
            const permissionLevel =
                await NotificationManager.checkPermissions();
            return { success: true, permissionLevel };
        },
    };
}
