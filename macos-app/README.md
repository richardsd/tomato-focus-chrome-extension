# Tomato Focus macOS app scaffold

This directory contains a Swift Package Manager-based macOS SwiftUI app scaffold with modular targets:

- `AppShell`: app-level navigation and composition of feature views.
- `TimerFeature`: timer UI and state management.
- `TasksFeature`: local tasks and Jira import entry point.
- `StatisticsFeature`: completed session statistics.
- `SettingsFeature`: timer and break configuration.
- `JiraIntegration`: Jira service implementation.
- `PlatformServices`: notification, storage, scheduler, and idle monitor adapters.
- `CoreInterfaces`: framework-agnostic contracts and models used across modules.
- `CoreDI`: dependency container used to wire module dependencies.

## Dependency injection approach

Feature modules depend only on `CoreInterfaces` protocols (for example `StorageServicing`, `NotificationServicing`, and `JiraServicing`) rather than on concrete service implementations or platform frameworks. The executable target composes concrete implementations and injects them through `AppContainer`.

This keeps shared core logic reusable and decoupled from framework-specific service implementations.
