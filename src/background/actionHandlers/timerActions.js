import { ACTIONS } from '../../shared/runtimeActions.js';
import { getStateResponse, getSuccessStateResponse } from './common.js';

export function createTimerActionHandlers(controller) {
    return {
        [ACTIONS.GET_STATE]: () => getStateResponse(controller),
        [ACTIONS.START]: async () => {
            await controller.start();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.PAUSE]: async () => {
            await controller.pause();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.RESET]: async () => {
            await controller.reset();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.RESET_TIMER]: async () => {
            await controller.reset();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.SKIP_BREAK]: async () => {
            await controller.skipBreak();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.TOGGLE_TIMER]: async () => {
            await controller.toggle();
            return getSuccessStateResponse(controller);
        },
    };
}
