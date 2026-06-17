# macOS UI Modernization Checklist

Use this checklist when validating major macOS UI/UX updates.

## Visual system consistency

- [ ] Shared spacing tokens are used across Timer, Tasks, Statistics, and Settings.
- [ ] Shared button styles are used for primary, secondary, and destructive actions.
- [ ] Card/surface styles are consistent across all primary screens.
- [ ] Typography hierarchy is consistent (`title`, `subtitle`, body, metric).
- [ ] Light, dark, and system theme modes render without contrast regressions.

## Navigation and shell

- [ ] Sidebar sections are present for Timer, Tasks, and Statistics.
- [ ] Active sidebar section is visually clear.
- [ ] Toolbar quick actions (start/pause, reset, quick start) work from every section.
- [ ] Settings opens in the native macOS Settings scene and is not a workspace sidebar section.

## Timer-first UX

- [ ] Timer hero state is readable at a glance (session type, countdown, run state).
- [ ] Start/Pause/Resume action is prominent and one-click.
- [ ] Reset and Skip Break are discoverable and correctly enabled/disabled.
- [ ] Quick start presets (5/15/25/45) start immediately.
- [ ] Current task context is shown when a current task is set.

## Tasks UX

- [ ] List/detail layout supports selection, add, edit, save, and cancel flows.
- [ ] Filter controls expose All/In Progress/Completed with counts.
- [ ] Current task is clearly indicated in the list and detail pane.
- [ ] Completed tasks do not expose Set Current.
- [ ] Task detail actions (set/unset current, edit, delete, complete/reopen) are keyboard and mouse operable.
- [ ] Empty states provide clear next action language.

## Statistics UX

- [ ] KPI cards show completed today, total focus time, and active days.
- [ ] Separate sessions and focus-minutes charts render daily metrics with independent scales.
- [ ] Last-30-days charts include zero-value days.
- [ ] History list values match persisted statistics.
- [ ] Clear statistics action has destructive confirmation.

## Settings UX

- [ ] General, Jira, and Data tabs are available in the native Settings window.
- [ ] Durations, behavior, sound, Jira, and data exchange controls are grouped clearly.
- [ ] Validation errors are shown inline and are actionable.
- [ ] Save status is visible after successful settings save.
- [ ] Jira settings validation still enforces complete credentials.

## Accessibility

- [ ] Full keyboard navigation works for primary actions on every screen.
- [ ] VoiceOver reads labels and controls in a sensible order.
- [ ] Reduced motion mode removes nonessential transitions.
- [ ] Dynamic text scaling keeps layouts usable and non-overlapping.

## Regression checks

- [ ] Timer transitions and cadence rules remain parity-correct.
- [ ] Task pomodoro increment behavior is unchanged.
- [ ] Statistics aggregation semantics are unchanged.
- [ ] Menu bar controls and keyboard commands remain functional.
