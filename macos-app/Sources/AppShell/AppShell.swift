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

    public var id: String { rawValue }

    var title: String {
        switch self {
        case .timer:
            "Timer"
        case .tasks:
            "Tasks"
        case .statistics:
            "Statistics"
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
        }
    }
}

public struct RootNavigationView: View {
    @ObservedObject private var timerViewModel: TimerViewModel
    @ObservedObject private var settingsViewModel: SettingsViewModel
    @StateObject private var tasksViewModel: TasksViewModel
    @StateObject private var statisticsViewModel: StatisticsViewModel
    @State private var selectedSection: AppSection? = .timer

    public init(
        container: AppContainer,
        timerViewModel: TimerViewModel,
        settingsViewModel: SettingsViewModel
    ) {
        self.timerViewModel = timerViewModel
        self.settingsViewModel = settingsViewModel
        _tasksViewModel = StateObject(
            wrappedValue: TasksViewModel(
                storage: container.dependencies.storage,
                jira: container.dependencies.jira
            )
        )
        _statisticsViewModel = StateObject(
            wrappedValue: StatisticsViewModel(storage: container.dependencies.storage)
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
            }
            .listStyle(.sidebar)
            .navigationTitle("Tomato Focus")
            .navigationSplitViewColumnWidth(min: 200, ideal: 230, max: 340)
        } detail: {
            Group {
                switch selectedSection ?? .timer {
                case .timer:
                    TimerView(viewModel: timerViewModel)
                case .tasks:
                    TasksView(viewModel: tasksViewModel)
                case .statistics:
                    StatisticsView(viewModel: statisticsViewModel)
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
                Button {
                    timerViewModel.toggle()
                } label: {
                    Label(startButtonTitle, systemImage: timerViewModel.isRunning ? "pause.fill" : "play.fill")
                }
                .labelStyle(.iconOnly)
                .help(startButtonTitle)

                Button {
                    timerViewModel.reset()
                } label: {
                    Label("Reset", systemImage: "arrow.counterclockwise")
                }
                .labelStyle(.iconOnly)
                .help("Reset Session")

                Menu {
                    Button("5 minutes") { timerViewModel.startQuickTimer(minutes: 5) }
                    Button("15 minutes") { timerViewModel.startQuickTimer(minutes: 15) }
                    Button("25 minutes (Focus)") { timerViewModel.startQuickTimer(minutes: 25) }
                    Button("45 minutes") { timerViewModel.startQuickTimer(minutes: 45) }
                } label: {
                    Label("Quick Start", systemImage: "bolt.fill")
                }
                .labelStyle(.iconOnly)
                .menuStyle(.borderlessButton)
                .help("Quick Start")
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
