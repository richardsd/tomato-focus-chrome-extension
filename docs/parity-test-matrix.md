# Parity Test Matrix (Scenario-Level)

This matrix defines scenario-level parity checks between the Chrome extension (baseline) and the macOS product candidate. QA should execute each row against both products in the same test window/configuration and record evidence.

## Status definitions

- **Pass**: Behavior exactly matches the expectation for that product in this scenario.
- **Fail**: Behavior deviates from expectation, regresses baseline behavior, or produces data/state inconsistencies.
- **Parity Achieved**: Both product columns are **Pass** and observed outputs are materially equivalent.
- **Documented Exception**: A gap is intentionally deferred, linked to an explicit follow-up ticket, and approved by product + engineering.

## Scenario matrix

| ID | Scenario | Chrome extension (expected pass/fail) | macOS app (expected pass/fail) | Evidence to capture | GA-critical | Parity status |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Work session countdown transitions to short break at zero | **Pass** if timer decrements each second, hits `00:00`, and transitions to short break according to configured rules. **Fail** otherwise. | **Pass** if behavior mirrors extension transition semantics (including session label/state updates). **Fail** on mismatch or missed transition. | Timer screenshots/video + state logs at T-5s, T0, T+5s | Yes | Pending |
| T2 | Short-break-to-work auto-start behavior obeys setting | **Pass** if `autoStartBreaks`/`autoStartPomodoros` settings are honored exactly. **Fail** if manual/auto behavior is inverted or inconsistent. | **Pass** if same settings produce equivalent auto-start/manual behavior. **Fail** if default or runtime behavior diverges. | Settings snapshot + transition timeline | Yes | Pending |
| T3 | Long break occurs on configured interval (e.g., every 4 pomodoros) | **Pass** if interval counter and long-break switch align with configured cadence. **Fail** if cadence drifts/resets unexpectedly. | **Pass** if cadence/transition equivalence holds across full cycle. **Fail** for off-by-one or stale cycle state. | Run log for full cycle + completed-session counter | Yes | Pending |
| R1 | Restart recovery while work timer is active | **Pass** if relaunch restores in-progress session and recomputes remaining time from elapsed wall-clock time. **Fail** if session resets or remaining time is incorrect. | **Pass** if relaunch behavior matches extension (session type, remaining time, active task context). **Fail** on reset/drift/loss of context. | Pre-restart and post-restart timestamps + timer values | Yes | Pending |
| R2 | Restart recovery while paused timer is active | **Pass** if paused state persists across restart with same remaining time (allowing negligible clock delta). **Fail** if timer resumes unexpectedly or loses paused state. | **Pass** if paused-state persistence semantics match extension. **Fail** on unexpected resume/reset. | Paused-state screenshot pre/post restart | Yes | Pending |
| I1 | Idle pause enabled: timer pauses on idle and remains paused until user resumes | **Pass** if idle event pauses active timer and exposes clear paused state on return. **Fail** if timer continues counting or auto-resumes. | **Pass** if identical pause/resume semantics and state indicators are present. **Fail** on semantic mismatch. | Idle trigger method, timestamps, state screenshots | Yes | Pending |
| I2 | Idle pause disabled: timer continues uninterrupted through idle period | **Pass** if timer is not paused while idle when setting is off. **Fail** if any implicit pause occurs. | **Pass** if macOS behavior matches extension when idle pause is disabled. **Fail** on any pause/transition side effect. | Setting state + uninterrupted countdown capture | Yes | Pending |
| J1 | Jira manual sync success imports unresolved assigned issues without duplicates | **Pass** if import succeeds and deduplicates existing mapped tasks. **Fail** if duplicates or missing eligible issues occur. | **Pass** if import result set and dedupe behavior match extension mapping/filter semantics. **Fail** on mismatch. | Imported issue list + task IDs before/after | No | Pending |
| J2 | Jira auth failure (invalid token/credentials) | **Pass** if sync fails gracefully with actionable error and no destructive task changes. **Fail** if silent failure, crash, or data corruption occurs. | **Pass** if same failure class and user-facing recovery guidance are provided, with no task corruption. **Fail** otherwise. | Error message capture + tasks integrity check | No | Pending |
| J3 | Jira network timeout/5xx during scheduled sync | **Pass** if failure is logged/notified per design, next run can recover, and partial writes are prevented. **Fail** if scheduler stalls or inconsistent task state appears. | **Pass** if retry/recovery semantics are equivalent and state remains consistent. **Fail** on stuck scheduler or inconsistent persistence. | Scheduler logs + subsequent successful sync proof | No | Pending |
| N1 | Session completion notification shown when notifications enabled | **Pass** if visible completion notification appears at session end. **Fail** if missing, delayed beyond tolerance, or shown when disabled. | **Pass** if native notification behavior matches extension enable/disable semantics. **Fail** on mismatch. | Notification center capture + setting state | Yes | Pending |
| N2 | Session completion sound honors enable/disable and volume settings | **Pass** if sound plays only when enabled and obeys configured volume profile. **Fail** if sound ignores settings. | **Pass** if macOS output behavior is equivalent for on/off and volume controls. **Fail** on mismatch. | Audio setting snapshot + measured/observed output | Yes | Pending |
| TS1 | Completing a work session increments focused task pomodoro count exactly once | **Pass** if selected task increments once (no under/over-count). **Fail** on duplicate/missing increment. | **Pass** if increment semantics match extension, including task selection edge cases. **Fail** on mismatch. | Task before/after values + session completion proof | Yes | Pending |
| TS2 | Completing sessions updates daily stats (count + focus minutes) correctly | **Pass** if statistics totals reflect completed sessions and durations for the day. **Fail** on aggregation errors. | **Pass** if daily aggregation and display semantics match extension totals for same run. **Fail** on divergence. | Stats snapshots + calculation worksheet | Yes | Pending |
| TS3 | Skip/reset flows do not incorrectly increment tasks or stats | **Pass** if canceled/skipped sessions avoid unintended increments. **Fail** if stats/tasks mutate incorrectly. | **Pass** if guardrails match extension behavior for skip/reset cases. **Fail** on side effects. | Event log + before/after task/stats state | Yes | Pending |

## CI/process gate

Release readiness checks must enforce the following:

1. **GA-critical parity gate**: Every row marked `GA-critical = Yes` must have `Parity status = Parity Achieved` before a GA release candidate can be promoted.
2. **Deferred-gap exception gate**: Any row not at `Parity Achieved` must include a documented exception entry containing:
   - Rationale for deferral
   - Risk/impact assessment
   - Explicit follow-up ticket link/ID (owner + target milestone)
   - Approval from product and engineering leads

A build/release pipeline gate should fail when either condition is unmet.
