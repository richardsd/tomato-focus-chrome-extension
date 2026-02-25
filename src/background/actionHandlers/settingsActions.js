import { ACTIONS } from '../../shared/runtimeActions.js';
import { getSuccessStateResponse } from './common.js';

export function createSettingsActionHandlers(controller) {
    return {
        [ACTIONS.SAVE_SETTINGS]: async (request) => {
            controller.state.updateSettings(request.settings);

            const isLongBreakIntervalReached =
                controller.state.currentSession %
                    controller.state.settings.longBreakInterval ===
                0;
            let newDuration;
            if (controller.state.isWorkSession) {
                newDuration = controller.state.settings.workDuration * 60;
            } else if (isLongBreakIntervalReached) {
                newDuration = controller.state.settings.longBreak * 60;
            } else {
                newDuration = controller.state.settings.shortBreak * 60;
            }

            // Reset remaining time to the newly selected duration rather than
            // adjusting by the previously elapsed amount which was causing the
            // timer to grow instead of updating to the expected value.
            controller.state.timeLeft = newDuration;

            if (controller.state.isRunning) {
                await chrome.alarms.clear(controller.alarmName);
                await controller.scheduleAlarm();
            } else {
                controller.state.endTime = null;
            }

            await controller.configureJiraSyncAlarm();
            controller.updateUI();

            return getSuccessStateResponse(controller);
        },
        [ACTIONS.RECONFIGURE_JIRA_SYNC]: async () => {
            await controller.configureJiraSyncAlarm();
            return { success: true };
        },
        [ACTIONS.UPDATE_UI_PREFERENCES]: async (request) => {
            controller.state.uiPreferences = {
                ...controller.state.uiPreferences,
                ...(request.uiPreferences || request.updates || {}),
            };
            await controller.saveState();
            return getSuccessStateResponse(controller);
        },
    };
}
