# macOS UI Fix Plan

## Summary

Fix the reviewed macOS UI issues by making Settings a native settings scene, simplifying global timer controls, converting Tasks to a desktop list/detail workflow, separating Statistics chart scales, and lightening shared surfaces.

## Key Changes

- App shell: change the main scene to `WindowGroup("Tomato Focus", id: "main")`, add a dedicated `Settings { SettingsView(...) }` scene, remove `settings` from `AppSection`, and remove sidebar “Quick Actions”.
- Settings: move `SettingsViewModel` ownership to `TomatoFocusApp` so the main window and settings window share the same draft settings; reshape `SettingsView` into a compact settings-window layout with General, Jira, and Data tabs while preserving explicit Save, validation, and import behavior.
- Tasks: replace the full-width card list with a two-pane Tasks surface: compact native `List` on the left, selected task detail/editor on the right. Add “New Task”, edit/save/cancel, current-task controls, complete/reopen, and delete actions in the detail pane. Completed tasks must not expose “Set Current”.
- Statistics: replace the mixed-axis chart with separate “Completed sessions” and “Focus minutes” charts using independent Y-axes and a dense last-30-days series with zero-value days.
- Design system: reduce `DSCardModifier` visual weight by lowering shadow opacity/radius and using subtler borders; rely on native list/form surfaces for Tasks and Settings where possible.

## Interfaces And Behavior

- `RootNavigationView` should accept a shared `SettingsViewModel` instead of constructing its own.
- `TasksViewModel.saveDraft()` should return the saved task ID so the new list/detail UI can select the created or updated task.
- Add small task helpers as needed, such as `task(id:)` and `canSetCurrent(_:)`; do not change persisted task/statistics schemas.
- Update smoke tests that currently expect sidebar Settings and Quick Actions to reflect the new navigation model.

## Test Plan

- Run `cd macos-app && swift test`.
- Run root-required checks after code/doc changes: `npm run lint` and `npm run test`.
- Manually verify Timer, Tasks, Statistics, native Settings window, menu-bar controls, and keyboard shortcuts.
- Confirm Settings is accessible from the macOS app menu and no longer appears as a workspace sidebar section.

## Assumptions

- Use the selected “List/detail” Tasks approach.
- Keep macOS 13 compatibility; avoid newer SwiftUI-only settings openers unless availability is guarded.
- The Chrome extension UI and data schemas remain out of scope.
