# Platform Adapter Plan (Chrome Extension → macOS)

This document maps existing Chrome Extension APIs to macOS-native equivalents and captures the adapter interfaces now used by the extension background code.

## API mapping

| Chrome extension API | Adapter boundary in code | macOS equivalent |
| --- | --- | --- |
| `chrome.storage` | `StorageAdapter` (`createChromeStorageAdapter`) | `UserDefaults` for small preferences/state, plus a local file/DB abstraction (for larger task/statistics payloads and migrations). |
| `chrome.notifications` | `NotificationsAdapter` (`createChromeNotificationsAdapter`) | `UNUserNotificationCenter` with app-level notification permission checks and local notification requests. |
| `chrome.alarms` | `SchedulerAdapter` (`createChromeSchedulerAdapter`) | Scheduler service built on `DispatchSourceTimer` / `BGTaskScheduler` / launch agent patterns, with wake + recovery logic to recompute missed expirations after sleep/terminate. |
| `chrome.idle` | `IdleProvider` (`createChromeIdleProvider`) | Idle/lock signal provider backed by macOS session notifications (`NSWorkspace.screensDidSleepNotification`, lock/unlock signals, HID idle time). |
| `chrome.contextMenus` | `ContextMenusAdapter` (`createChromeContextMenusAdapter`) | Menu bar actions, app command menu entries, and keyboard shortcuts (`NSStatusItem`, app menu commands, shortcut handlers). |

## Adapter interfaces (code)

The codebase now routes these APIs through contracts in `src/core/contracts.js`:

- `StorageAdapter`: `get`, `set`
- `NotificationsAdapter`: `getPermissionLevel`, `create`, `clear`
- `SchedulerAdapter`: `create`, `clear`, `clearAll`, `onAlarm`
- `IdleProvider`: `queryState`, `onStateChanged`
- `ContextMenusAdapter`: `removeAll`, `create`, `update`, `onClicked`

## Current integration in extension code

- Storage reads/writes in `StorageManager` are now powered by `StorageAdapter`.
- Notification permissions + creation/clear are now powered by `NotificationsAdapter`.
- Timer alarm subscriptions are wired through `SchedulerAdapter.onAlarm`.
- Context menu creation/update/click handlers are routed through `ContextMenusAdapter`.

These boundaries keep feature logic platform-neutral and isolate Chrome specifics to adapter factories in `src/background/adapters/chromeAdapters.js`.

## macOS implementation guidance

When adding a native macOS target, implement adapters with equivalent contracts:

1. **Storage adapter**
   - Persist settings in `UserDefaults`.
   - Persist task/history payloads via file-backed JSON or SQLite/Core Data.
   - Keep key compatibility where migration from extension export/import is required.

2. **Notification adapter**
   - Request/check authorization via `UNUserNotificationCenter`.
   - Build local notifications mirroring current title/message semantics.
   - Keep sound playback policy separate from notification permission (same separation as extension/offscreen audio behavior).

3. **Scheduler adapter with wake/recovery**
   - Store scheduled target timestamps in persistent storage.
   - On app launch/wake, recompute elapsed sessions and recover state before scheduling next timer.
   - Distinguish one-shot timers (session completion) from periodic sync jobs.

4. **Idle provider**
   - Provide active/idle/locked signals from macOS session + idle APIs.
   - Preserve current pause-on-idle behavior and explicit resume checks.

5. **Context actions adapter**
   - Expose start/pause/reset/skip/quick-timer actions in menu bar and command menu.
   - Keep action IDs stable (`start-pause`, `reset`, `skip-break`, `quick-*`) so controller wiring can be reused.
