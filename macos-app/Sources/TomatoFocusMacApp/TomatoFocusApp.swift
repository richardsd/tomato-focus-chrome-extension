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
    private let jiraAutoSyncCoordinator: JiraAutoSyncCoordinator
    @StateObject private var timerViewModel: TimerViewModel
    private let mainWindowID = "main"

    init() {
        let storage = UserDefaultsStorageService()
        let container = AppContainer(
            dependencies: AppDependencies(
                notifications: NotificationService(),
                storage: storage,
                scheduler: TimerSchedulerService(),
                idleMonitor: IdleMonitorService(),
                jira: JiraService(storage: storage)
            )
        )
        self.container = container
        self.jiraAutoSyncCoordinator = JiraAutoSyncCoordinator(
            storage: container.dependencies.storage,
            jira: container.dependencies.jira,
            scheduler: container.dependencies.scheduler
        )
        _timerViewModel = StateObject(
            wrappedValue: TimerViewModel(
                notifications: container.dependencies.notifications,
                scheduler: container.dependencies.scheduler,
                storage: container.dependencies.storage,
                idleMonitor: container.dependencies.idleMonitor
            )
        )
    }

    var body: some Scene {
        Window("Tomato Focus", id: mainWindowID) {
            RootNavigationView(container: container, timerViewModel: timerViewModel)
        }
        .commands {
            TimerQuickActionsCommands(timerViewModel: timerViewModel)
        }

        MenuBarExtra {
            MenuBarContentView(timerViewModel: timerViewModel, mainWindowID: mainWindowID)
        } label: {
            Label(menuBarTitle, systemImage: timerViewModel.isRunning ? "timer.circle.fill" : "timer")
        }
        .menuBarExtraStyle(.window)
    }

    private var menuBarTitle: String {
        timerViewModel.isRunning ? formatSeconds(timerViewModel.secondsRemaining) : "Tomato"
    }

    private func formatSeconds(_ seconds: Int) -> String {
        let minutes = max(seconds, 0) / 60
        let remainder = max(seconds, 0) % 60
        return String(format: "%02d:%02d", minutes, remainder)
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
