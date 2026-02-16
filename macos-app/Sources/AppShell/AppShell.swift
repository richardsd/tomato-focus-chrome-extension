import CoreDI
import CoreInterfaces
import SettingsFeature
import StatisticsFeature
import SwiftUI
import TasksFeature
import TimerFeature

public struct RootNavigationView: View {
    private let container: AppContainer

    public init(container: AppContainer) {
        self.container = container
    }

    public var body: some View {
        TabView {
            TimerView(
                viewModel: TimerViewModel(
                    notifications: container.dependencies.notifications,
                    scheduler: container.dependencies.scheduler,
                    storage: container.dependencies.storage
                )
            )
            .tabItem { Label("Timer", systemImage: "timer") }

            TasksView(
                viewModel: TasksViewModel(
                    storage: container.dependencies.storage,
                    jira: container.dependencies.jira
                )
            )
            .tabItem { Label("Tasks", systemImage: "checklist") }

            StatisticsView(
                viewModel: StatisticsViewModel(storage: container.dependencies.storage)
            )
            .tabItem { Label("Statistics", systemImage: "chart.bar") }

            SettingsView(
                viewModel: SettingsViewModel(storage: container.dependencies.storage)
            )
            .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .frame(minWidth: 640, minHeight: 420)
    }
}
