import { TaskManager } from '../tasks.js';
import { ACTIONS } from '../../shared/runtimeActions.js';
import { getSuccessStateResponse, normalizeTaskIds } from './common.js';

export function createTaskActionHandlers(controller) {
    return {
        [ACTIONS.CREATE_TASK]: async (request) => {
            await TaskManager.createTask(request.task);
            controller.state.tasks = await TaskManager.getTasks();
            await controller.saveState();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.UPDATE_TASK]: async (request) => {
            await TaskManager.updateTask(request.taskId, request.updates);
            controller.state.tasks = await TaskManager.getTasks();
            if (
                controller.state.currentTaskId === request.taskId &&
                request.updates?.isCompleted
            ) {
                controller.state.currentTaskId = null;
            }
            await controller.saveState();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.DELETE_TASK]: async (request) => {
            await TaskManager.deleteTask(request.taskId);
            if (controller.state.currentTaskId === request.taskId) {
                controller.state.currentTaskId = null;
            }
            controller.state.tasks = await TaskManager.getTasks();
            await controller.saveState();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.COMPLETE_TASKS]: async (request) => {
            const taskIds = normalizeTaskIds(request.taskIds);
            const completedIds = new Set(taskIds.map((id) => String(id)));
            const updatedTasks = await TaskManager.completeTasks(taskIds);
            if (
                controller.state.currentTaskId &&
                completedIds.has(String(controller.state.currentTaskId))
            ) {
                controller.state.currentTaskId = null;
            }
            controller.state.tasks = updatedTasks;
            await controller.saveState();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.DELETE_TASKS]: async (request) => {
            const taskIds = normalizeTaskIds(request.taskIds);
            const deletedIds = new Set(taskIds.map((id) => String(id)));
            const updatedTasks = await TaskManager.deleteTasks(taskIds);
            if (
                controller.state.currentTaskId &&
                deletedIds.has(String(controller.state.currentTaskId))
            ) {
                controller.state.currentTaskId = null;
            }
            controller.state.tasks = updatedTasks;
            await controller.saveState();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.GET_TASKS]: async () => {
            const tasks = await TaskManager.getTasks();
            return { success: true, tasks };
        },
        [ACTIONS.SET_CURRENT_TASK]: async (request) => {
            controller.state.currentTaskId = request.taskId;
            await controller.saveState();
            return getSuccessStateResponse(controller);
        },
        [ACTIONS.CLEAR_COMPLETED_TASKS]: async () => {
            await TaskManager.clearCompletedTasks();
            controller.state.tasks = await TaskManager.getTasks();
            if (controller.state.currentTaskId) {
                const exists = controller.state.tasks.some(
                    (task) => task.id === controller.state.currentTaskId
                );
                if (!exists) {
                    controller.state.currentTaskId = null;
                }
            }
            await controller.saveState();
            return getSuccessStateResponse(controller);
        },
    };
}
