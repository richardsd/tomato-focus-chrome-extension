import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskUIManager } from '../src/popup/tasks.js';
import { ACTIONS } from '../src/shared/runtimeActions.js';

const TASKS = [
    {
        id: 'task-1',
        title: 'Pending task',
        description: 'first',
        completedPomodoros: 0,
        estimatedPomodoros: 2,
        isCompleted: false,
    },
    {
        id: 'task-2',
        title: 'In progress task',
        description: 'second',
        completedPomodoros: 1,
        estimatedPomodoros: 3,
        isCompleted: false,
    },
    {
        id: 'task-3',
        title: 'Completed task',
        description: 'third',
        completedPomodoros: 2,
        estimatedPomodoros: 2,
        isCompleted: true,
    },
];

function createTasksDomFixture() {
    document.body.innerHTML = `
        <button id="syncJiraBtn"></button>
        <div id="tasksHeaderBar"></div>
        <div id="tasksSelectionBar" class="hidden">
            <span id="tasksSelectionCount"></span>
            <button id="cancelSelectionBtn" type="button">Cancel</button>
            <button data-action="delete-selected" type="button">Delete selected</button>
            <button data-action="complete-selected" type="button">Complete selected</button>
        </div>
        <button data-action="select-all" type="button" role="checkbox" aria-checked="false">
            <span data-select-all-icon>⬜</span>
            <span data-select-all-label>Select all tasks</span>
        </button>
        <button id="clearCompletedBtn" class="hidden" type="button"></button>
        <div id="tasksList"></div>

        <div id="currentTask" class="hidden"></div>
        <div id="currentTaskName"></div>
        <div id="currentTaskProgress"></div>

        <div id="taskFormModal" class="hidden"></div>
        <div id="taskFormTitle"></div>
        <form id="taskForm"></form>
        <input id="taskTitle" />
        <textarea id="taskDescription"></textarea>
        <input id="taskEstimate" />
    `;
}

function createManager(sendMessage = vi.fn()) {
    return new TaskUIManager({ sendMessage });
}

describe('TaskUIManager renderTasksList and actions', () => {
    beforeEach(() => {
        createTasksDomFixture();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    it('filters tasks for all, in-progress, and completed', () => {
        const manager = createManager();

        manager.currentFilter = 'all';
        manager.renderTasksList(TASKS, null);
        expect(document.querySelectorAll('.task-item')).toHaveLength(3);

        manager.currentFilter = 'in-progress';
        manager.renderTasksList(TASKS, null);
        const inProgressIds = Array.from(
            document.querySelectorAll('.task-item')
        ).map((el) => el.dataset.taskId);
        expect(inProgressIds).toEqual(['task-1', 'task-2']);

        manager.currentFilter = 'completed';
        manager.renderTasksList(TASKS, null);
        const completedIds = Array.from(
            document.querySelectorAll('.task-item')
        ).map((el) => el.dataset.taskId);
        expect(completedIds).toEqual(['task-3']);
        expect(
            document
                .getElementById('clearCompletedBtn')
                .classList.contains('hidden')
        ).toBe(false);
    });

    it('renders empty state and keeps selection controls disabled when no tasks are displayed', () => {
        const manager = createManager();

        manager.renderTasksList([], null);

        expect(document.querySelector('.tasks-empty__text')?.textContent).toBe(
            'No tasks yet'
        );
        expect(
            document.querySelector('[data-action="select-all"]').disabled
        ).toBe(true);
        expect(
            document.querySelector('[data-action="delete-selected"]').disabled
        ).toBe(true);
        expect(
            document.querySelector('[data-action="complete-selected"]').disabled
        ).toBe(true);
    });

    it('updates selection bar state and toggles select-all selection', () => {
        const manager = createManager();
        manager.renderTasksList(TASKS, null);

        const header = document.getElementById('tasksHeaderBar');
        const selectionBar = document.getElementById('tasksSelectionBar');
        const selectionCount = document.getElementById('tasksSelectionCount');
        const selectAllBtn = document.querySelector(
            '[data-action="select-all"]'
        );

        const firstCheckbox = document.querySelector('.task-item__checkbox');
        firstCheckbox.checked = true;
        firstCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

        expect(manager.selectedTaskIds).toEqual(['task-1']);
        expect(header.classList.contains('hidden')).toBe(true);
        expect(selectionBar.classList.contains('hidden')).toBe(false);
        expect(selectionCount.textContent).toBe('1 Selected');
        expect(selectAllBtn.getAttribute('aria-checked')).toBe('mixed');

        selectAllBtn.click();
        expect(manager.selectedTaskIds).toEqual(['task-1', 'task-2', 'task-3']);
        expect(selectAllBtn.getAttribute('aria-checked')).toBe('true');
        expect(selectAllBtn.getAttribute('aria-label')).toBe('Clear selection');

        selectAllBtn.click();
        expect(manager.selectedTaskIds).toEqual([]);
        expect(selectAllBtn.getAttribute('aria-checked')).toBe('false');
    });

    it('invokes runtime actions from task action handlers', async () => {
        const sendMessage = vi.fn(async (action) => {
            if (action === ACTIONS.GET_STATE) {
                return { tasks: TASKS, currentTaskId: null };
            }
            if (action === ACTIONS.GET_TASKS) {
                return { tasks: TASKS };
            }
            return { tasks: TASKS, currentTaskId: null };
        });

        const manager = createManager(sendMessage);
        manager.renderTasksList(TASKS, null);

        document.querySelector('.task-select[data-task-id="task-1"]').click();
        await Promise.resolve();
        await Promise.resolve();

        document.querySelector('.task-complete[data-task-id="task-1"]').click();
        await Promise.resolve();

        document.querySelector('.task-reopen[data-task-id="task-3"]').click();
        await Promise.resolve();

        document.querySelector('.task-edit[data-task-id="task-1"]').click();
        await Promise.resolve();

        document.querySelector('.task-delete[data-task-id="task-1"]').click();
        await Promise.resolve();

        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.GET_STATE);
        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.SET_CURRENT_TASK, {
            taskId: 'task-1',
        });
        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.UPDATE_TASK, {
            taskId: 'task-1',
            updates: { isCompleted: true },
        });
        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.UPDATE_TASK, {
            taskId: 'task-3',
            updates: { isCompleted: false },
        });
        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.GET_TASKS);
        expect(sendMessage).toHaveBeenCalledWith(ACTIONS.DELETE_TASK, {
            taskId: 'task-1',
        });
    });
});
