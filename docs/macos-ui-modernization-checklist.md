# macOS UI Modernization Checklist

Use this checklist when validating major macOS UI/UX updates.

## Visual system consistency

- [ ] Shared spacing tokens are used across Timer, Tasks, Statistics, and Settings.
- [ ] Shared button styles are used for primary, secondary, and destructive actions.
- [ ] Card/surface styles are consistent across all primary screens.
- [ ] Typography hierarchy is consistent (`title`, `subtitle`, body, metric).
- [ ] Light, dark, and system theme modes render without contrast regressions.

## Navigation and shell

- [ ] Sidebar sections are present for Timer, Tasks, Statistics, and Settings.
- [ ] Active sidebar section is visually clear.
- [ ] Sidebar quick actions work without opening additional windows.
- [ ] Toolbar quick actions (start/pause, reset, quick start) work from every section.

## Timer-first UX

- [ ] Timer hero state is readable at a glance (session type, countdown, run state).
- [ ] Start/Pause/Resume action is prominent and one-click.
- [ ] Reset and Skip Break are discoverable and correctly enabled/disabled.
- [ ] Quick start presets (5/15/25/45) start immediately.
- [ ] Current task context is shown when a current task is set.

## Tasks UX

- [ ] Quick capture card supports add and edit flows.
- [ ] Filter controls expose All/In Progress/Completed with counts.
- [ ] Current task is clearly indicated in task rows.
- [ ] Task row actions (set/unset current, edit, delete, complete) are keyboard and mouse operable.
- [ ] Empty states provide clear next action language.

## Statistics UX

- [ ] KPI cards show completed today, total focus time, and active days.
- [ ] Trend chart renders daily sessions/focus metrics correctly.
- [ ] History list values match persisted statistics.
- [ ] Clear statistics action has destructive confirmation.

## Settings UX

- [ ] Durations, behavior, sound, Jira, and data exchange are grouped into distinct cards.
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
