import AppKit
import AppShell
import CoreDI
import CoreInterfaces
import JiraIntegration
import PlatformServices
import SwiftUI
import TimerFeature

@main
struct TomatoFocusApp: App {
    private let container: AppContainer
    @StateObject private var timerViewModel: TimerViewModel

    init() {
        let container = AppContainer(
            dependencies: AppDependencies(
                notifications: NotificationService(),
                storage: UserDefaultsStorageService(),
                scheduler: TimerSchedulerService(),
                idleMonitor: IdleMonitorService(),
                jira: JiraService()
            )
        )
        self.container = container
        _timerViewModel = StateObject(
            wrappedValue: TimerViewModel(
                notifications: container.dependencies.notifications,
                scheduler: container.dependencies.scheduler,
                storage: container.dependencies.storage
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            RootNavigationView(container: container, timerViewModel: timerViewModel)
        }
        .commands {
            TimerQuickActionsCommands(timerViewModel: timerViewModel)
        }
    }
}

private struct TimerQuickActionsCommands: Commands {
    @ObservedObject var timerViewModel: TimerViewModel

    var body: some Commands {
        CommandMenu("Timer") {
            Button(timerViewModel.isRunning ? "Pause" : "Start") {
                timerViewModel.toggle()
            }
            .keyboardShortcut("s", modifiers: [.command, .shift])

            Button("Reset") {
                timerViewModel.reset()
            }
            .keyboardShortcut("r", modifiers: [.command, .shift])

            Button("Skip Break") {
                timerViewModel.skipBreak()
            }
            .keyboardShortcut("k", modifiers: [.command, .shift])
            .disabled(timerViewModel.isWorkSession)

            Divider()

            Menu("Quick Start") {
                Button("5 minutes") {
                    timerViewModel.startQuickTimer(minutes: 5)
                }

                Button("15 minutes") {
                    timerViewModel.startQuickTimer(minutes: 15)
                }

                Button("25 minutes (Focus)") {
                    timerViewModel.startQuickTimer(minutes: 25)
                }

                Button("45 minutes") {
                    timerViewModel.startQuickTimer(minutes: 45)
                }
            }
        }
    }
}
