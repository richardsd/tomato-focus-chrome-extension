# Chrome Extension → macOS Parity Matrix

This matrix tracks feature-level parity between the current Chrome extension and the planned native macOS app.

| Feature Area | Current extension behavior (sources) | Planned macOS behavior | Acceptance criteria (observable) | Status | Owner | Target milestone |
| --- | --- | --- | --- | --- | --- | --- |
| Timer engine | Background timer state is managed in `src/background/timer.js` with work/short/long session transitions, auto-start handling, alarm scheduling, and badge/UI updates; popup/dashboard surfaces consume and display timer state (`src/popup/ui.js`, `src/dashboard/index.js`). | Native timer service with equivalent work/break cycle rules, start/pause/reset/skip actions, and synchronized UI state across all app windows/menus. | Starting a work session counts down in real time, transitions to break when complete, and follows configured long-break interval and auto-start behavior exactly as in extension defaults/settings. | Not Started | macOS App Team (TBD) | Milestone 1 (Core timer parity) |
| Tasks | Task CRUD, completion, bulk actions, and pomodoro incrementing are implemented in `src/background/tasks.js`; task workflows appear in popup and dashboard task UIs (`src/popup/tasks.js`, `src/dashboard/tasks.js`). | Native task list with full CRUD, completion state, estimated/completed pomodoro counts, current-focus task selection, and bulk operations. | Users can add/edit/delete tasks, mark one or many tasks complete, select a current task for focus, and see completed pomodoros increment after finished work sessions. | Not Started | Productivity Features (TBD) | Milestone 2 (Task parity) |
| Statistics | Daily statistics are persisted and computed in `src/background/statistics.js`; shown in popup and dashboard views (`src/popup/ui.js`, `src/dashboard/statistics.js`). | Native statistics module exposing today + historical summaries with the same daily aggregation semantics. | Completing sessions updates today’s completed count and focus minutes, and history/summary views match expected totals for the same day range. | Not Started | Analytics/Insights (TBD) | Milestone 2 (Stats parity) |
| Settings | Timer, behavior, theme, notifications/audio, idle, and Jira sync settings are validated in `src/popup/settings.js`, stored in timer state (`src/background/timer.js`), and defaulted in shared state (`src/shared/stateDefaults.js`). | Central macOS preferences pane with equivalent settings, validation, defaults, and live application to running timer/session behavior. | Changing a setting (e.g., work duration, auto-start, pause-on-idle, sync interval) immediately affects future timer behavior and persists across relaunch. | In Progress | Platform UX (TBD) | Milestone 1 (Preferences baseline) |
| Jira sync | Jira fetch/import logic and periodic sync alarms are handled by `src/background/jira.js` and `src/background/jiraSync.js`; task import triggers are available from popup task UI (`src/popup/tasks.js`). | Secure Jira integration using stored credentials/token, manual import, and scheduled background sync mirroring extension filters/mapping. | With valid Jira credentials, manual sync imports assigned unresolved issues; periodic sync runs at configured interval and avoids duplicate task creation. | Gap | Integrations (TBD) | Milestone 3 (External integrations) |
| Notifications/audio | Session-complete notifications and sound playback are managed by `src/background/notifications.js` and invoked through timer/UI notifier flow in `src/background/timer.js` and `src/background/uiNotifier.js`. | Native UserNotifications + bundled audio playback with per-user enable/disable and volume controls equivalent to extension settings. | On session completion, users receive a visible notification and optional sound (respecting play-sound and volume settings); disabling notifications/sound suppresses output. | Not Started | Platform Services (TBD) | Milestone 2 (Feedback channels) |
| Quick actions | Browser action context menu provides start/pause, reset, skip break, and quick-start durations in `src/background/contextMenus.js`; popup/dashboard also expose one-click timer/task controls (`src/popup/ui.js`, `src/dashboard/tasks.js`). | macOS quick actions via menu bar menu, keyboard shortcuts, and/or app intents matching extension command set. | Users can trigger start/pause/reset/skip and predefined quick timers (5/15/25/45) without opening the main window. | Not Started | Interaction Layer (TBD) | Milestone 2 (Action surface parity) |
| Persistence | App state/tasks/stats are saved to Chrome local storage via `src/background/storageManager.js`, `src/background/tasks.js`, and `src/background/statistics.js`, with defaults merged from `src/shared/stateDefaults.js`. | Durable local persistence layer (e.g., SQLite/Core Data) with schema supporting timer state, tasks, stats, settings, and migration/versioning. | Closing and reopening the app restores timer/task/settings/statistics state with no visible data loss in normal operation. | In Progress | Data Layer (TBD) | Milestone 1 (State persistence baseline) |
| Idle behavior | Idle listener in `src/background/timer.js` pauses running timers when `pauseOnIdle` is enabled and marks `wasPausedForIdle` for resume handling. | macOS idle/screen-lock awareness to pause focus sessions automatically when configured, with clear resume state messaging. | When idle pause is enabled, becoming idle pauses an active timer; returning active shows paused state and allows explicit resume without losing remaining time. | Not Started | Platform Services (TBD) | Milestone 3 (System behavior parity) |
| Restart recovery | Startup path in `src/background/timer.js` + `src/background/storageManager.js` restores saved state, recomputes remaining time from `endTime`, and rehydrates tasks/statistics. | App launch recovery that restores in-progress session context and recalculates remaining time after app/device restarts. | If the app is restarted mid-session, next launch shows the same session type/current task and a recalculated remaining timer that reflects elapsed wall-clock time. | In Progress | Core Runtime (TBD) | Milestone 1 (Lifecycle resilience) |

## Required for GA

The following parity rows are non-negotiable and must be **Parity Achieved** before release:

1. **Timer engine**
2. **Tasks**
3. **Settings**
4. **Persistence**
5. **Restart recovery**
6. **Notifications/audio**
7. **Idle behavior**
8. **Statistics**

Release can proceed only when each required row has:
- Status = `Parity Achieved`
- Acceptance criteria validated in an end-to-end QA pass on macOS
- No open Sev-1/Sev-2 defects tied to the feature area
