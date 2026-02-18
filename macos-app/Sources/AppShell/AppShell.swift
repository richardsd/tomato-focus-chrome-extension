import CoreDI
import CoreInterfaces
import DesignSystem
import SettingsFeature
import StatisticsFeature
import SwiftUI
import TasksFeature
import TimerFeature

public enum AppSection: String, CaseIterable, Identifiable {
    case timer
    case tasks
    case statistics
    case settings

    public var id: String { rawValue }

    var title: String {
        switch self {
        case .timer:
            "Timer"
        case .tasks:
            "Tasks"
        case .statistics:
            "Statistics"
        case .settings:
            "Settings"
        }
    }

    var subtitle: String {
        switch self {
        case .timer:
            "Run and control focus sessions"
        case .tasks:
            "Capture and manage work items"
        case .statistics:
            "Track your focus momentum"
        case .settings:
            "Tune behavior and integrations"
        }
    }

    var icon: String {
        switch self {
        case .timer:
            "timer"
        case .tasks:
            "checklist"
        case .statistics:
            "chart.bar.xaxis"
        case .settings:
            "gearshape"
        }
    }
}

public struct RootNavigationView: View {
    @ObservedObject private var timerViewModel: TimerViewModel
    @StateObject private var tasksViewModel: TasksViewModel
    @StateObject private var statisticsViewModel: StatisticsViewModel
    @StateObject private var settingsViewModel: SettingsViewModel
    @State private var selectedSection: AppSection? = .timer

    public init(container: AppContainer, timerViewModel: TimerViewModel) {
        self.timerViewModel = timerViewModel
        _tasksViewModel = StateObject(
            wrappedValue: TasksViewModel(
                storage: container.dependencies.storage,
                jira: container.dependencies.jira
            )
        )
        _statisticsViewModel = StateObject(
            wrappedValue: StatisticsViewModel(storage: container.dependencies.storage)
        )
        _settingsViewModel = StateObject(
            wrappedValue: SettingsViewModel(storage: container.dependencies.storage)
        )
    }

    public var body: some View {
        NavigationSplitView {
            List(selection: $selectedSection) {
                Section("Workspace") {
                    ForEach(AppSection.allCases) { section in
                        NavigationLink(value: section) {
                            VStack(alignment: .leading, spacing: DSSpacing.xxs) {
                                Label(section.title, systemImage: section.icon)
                                Text(section.subtitle)
                                    .font(.caption)
                                    .foregroundStyle(DSColor.secondaryText)
                            }
                            .padding(.vertical, DSSpacing.xxs)
                        }
                    }
                }

                Section("Quick Actions") {
                    Button(timerViewModel.isRunning ? "Pause Session" : startButtonTitle) {
                        timerViewModel.toggle()
                    }

                    Button("Reset Session") {
                        timerViewModel.reset()
                    }

                    Button("Skip Break") {
                        timerViewModel.skipBreak()
                    }
                    .disabled(timerViewModel.isWorkSession)

                    Menu("Quick Start") {
                        Button("5 minutes") { timerViewModel.startQuickTimer(minutes: 5) }
                        Button("15 minutes") { timerViewModel.startQuickTimer(minutes: 15) }
                        Button("25 minutes (Focus)") { timerViewModel.startQuickTimer(minutes: 25) }
                        Button("45 minutes") { timerViewModel.startQuickTimer(minutes: 45) }
                    }
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("Tomato Focus")
        } detail: {
            Group {
                switch selectedSection ?? .timer {
                case .timer:
                    TimerView(viewModel: timerViewModel)
                case .tasks:
                    TasksView(viewModel: tasksViewModel)
                case .statistics:
                    StatisticsView(viewModel: statisticsViewModel)
                case .settings:
                    SettingsView(viewModel: settingsViewModel)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(DSColor.pageBackground.opacity(0.6))
        }
        .navigationSplitViewStyle(.balanced)
        .frame(minWidth: 980, minHeight: 620)
        .preferredColorScheme(colorScheme(for: settingsViewModel.settings.theme))
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button(timerViewModel.isRunning ? "Pause" : startButtonTitle) {
                    timerViewModel.toggle()
                }
                .buttonStyle(DSPrimaryButtonStyle())

                Button("Reset") {
                    timerViewModel.reset()
                }
                .buttonStyle(DSSecondaryButtonStyle())

                Menu {
                    Button("5 minutes") { timerViewModel.startQuickTimer(minutes: 5) }
                    Button("15 minutes") { timerViewModel.startQuickTimer(minutes: 15) }
                    Button("25 minutes (Focus)") { timerViewModel.startQuickTimer(minutes: 25) }
                    Button("45 minutes") { timerViewModel.startQuickTimer(minutes: 45) }
                } label: {
                    Label("Quick Start", systemImage: "bolt.fill")
                }
                .menuStyle(.borderlessButton)
            }
        }
    }

    private var startButtonTitle: String {
        let full = timerViewModel.fullSessionDurationSeconds
        let remaining = timerViewModel.secondsRemaining
        let isResume = remaining > 0 && remaining < full
        return isResume ? "Resume Session" : "Start Session"
    }

    private func colorScheme(for theme: AppTheme) -> ColorScheme? {
        switch theme {
        case .system:
            nil
        case .light:
            .light
        case .dark:
            .dark
        }
    }
}
