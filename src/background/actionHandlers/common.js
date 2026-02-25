export function getStateResponse(controller) {
    return { state: controller.state.getState() };
}

export function getSuccessStateResponse(controller, extra = {}) {
    return {
        success: true,
        state: controller.state.getState(),
        ...extra,
    };
}

export function normalizeTaskIds(taskIds) {
    return Array.isArray(taskIds) ? taskIds : [];
}
