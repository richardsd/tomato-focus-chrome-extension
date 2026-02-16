import CoreDI
import CoreInterfaces
import SettingsFeature
import StatisticsFeature
import SwiftUI
import TasksFeature
import TimerFeature

public struct RootNavigationView: View {
    private let container: AppContainer
    @ObservedObject private var timerViewModel: TimerViewModel

    public init(container: AppContainer, timerViewModel: TimerViewModel) {
        self.container = container
        self.timerViewModel = timerViewModel
    }

    public var body: some View {
        TabView {
            TimerView(viewModel: timerViewModel)
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
