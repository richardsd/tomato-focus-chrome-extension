import Charts
import CoreInterfaces
import DesignSystem
import Foundation
import SwiftUI

public struct StatisticsHistoryRow: Identifiable, Equatable {
    public var id: String { dateKey }
    public let dateKey: String
    public let completedSessions: Int
    public let focusMinutes: Int
}

@MainActor
public final class StatisticsViewModel: ObservableObject {
    @Published public private(set) var stats: PomodoroStats
    @Published public private(set) var history: [StatisticsHistoryRow] = []
    @Published public var isClearConfirmationPresented = false

    public var completedSessionsToday: Int {
        stats.stats().completedSessions
    }

    public var totalFocusMinutes: Int {
        stats.totalFocusMinutes
    }

    public var activeDays: Int {
        history.filter { $0.completedSessions > 0 || $0.focusMinutes > 0 }.count
    }

    private let storage: StorageServicing
    private var observers: [NSObjectProtocol] = []

    public init(storage: StorageServicing) {
        self.storage = storage
        self.stats = storage.loadStats()
        refreshFromStorage()
        setupObservers()
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    public func refreshFromStorage() {
        var next = storage.loadStats()
        next.pruneHistory()

        if next != stats {
            storage.saveStats(next)
        }

        stats = next
        history = next.daily
            .map { key, value in
                StatisticsHistoryRow(
                    dateKey: key,
                    completedSessions: value.completedSessions,
                    focusMinutes: value.focusMinutes
                )
            }
            .filter { $0.completedSessions > 0 || $0.focusMinutes > 0 }
            .sorted { $0.dateKey > $1.dateKey }
    }

    public func requestClearAllStatistics() {
        isClearConfirmationPresented = true
    }

    public func clearAllStatistics() {
        storage.clearStats()
        isClearConfirmationPresented = false
        refreshFromStorage()
    }

    private func setupObservers() {
        let statsObserver = NotificationCenter.default.addObserver(
            forName: .statsDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.refreshFromStorage()
            }
        }

        let taskObserver = NotificationCenter.default.addObserver(
            forName: .tasksDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.refreshFromStorage()
            }
        }

        observers = [statsObserver, taskObserver]
    }
}

public struct StatisticsView: View {
    @ObservedObject private var viewModel: StatisticsViewModel

    public init(viewModel: StatisticsViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DSSpacing.lg) {
                Text("Statistics")
                    .font(DSTypography.title)

                metricsRow

                if chartRows.isEmpty {
                    emptyState
                } else {
                    chartCard
                    historyCard
                }

                HStack {
                    Spacer()
                    Button("Clear Statistics") {
                        viewModel.requestClearAllStatistics()
                    }
                    .buttonStyle(DSDestructiveButtonStyle())
                }
            }
            .padding(DSSpacing.xl)
            .frame(maxWidth: 980, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(DSColor.pageBackground.ignoresSafeArea())
        .alert(
            "Clear all statistics?",
            isPresented: $viewModel.isClearConfirmationPresented
        ) {
            Button("Cancel", role: .cancel) {}
            Button("Clear", role: .destructive) {
                viewModel.clearAllStatistics()
            }
        } message: {
            Text("This action cannot be undone.")
        }
    }

    private var metricsRow: some View {
        HStack(spacing: DSSpacing.sm) {
            DSMetricCard(
                title: "Completed today",
                value: String(viewModel.completedSessionsToday),
                symbol: "checkmark.circle.fill",
                tint: DSColor.focus
            )
            DSMetricCard(
                title: "Total focus time",
                value: formatMinutes(viewModel.totalFocusMinutes),
                symbol: "clock.fill",
                tint: DSColor.shortBreak
            )
            DSMetricCard(
                title: "Active days",
                value: String(viewModel.activeDays),
                symbol: "calendar",
                tint: DSColor.longBreak
            )
        }
    }

    private var chartCard: some View {
        VStack(alignment: .leading, spacing: DSSpacing.sm) {
            Text("Last 30 days")
                .font(DSTypography.subtitle)

            Chart(chartRows) { row in
                BarMark(
                    x: .value("Day", row.date, unit: .day),
                    y: .value("Sessions", row.completedSessions)
                )
                .foregroundStyle(DSColor.focus.gradient)
                .cornerRadius(4)

                LineMark(
                    x: .value("Day", row.date, unit: .day),
                    y: .value("Focus Minutes", row.focusMinutes)
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(DSColor.shortBreak)
                .lineStyle(StrokeStyle(lineWidth: 2))
            }
            .chartLegend(position: .top, alignment: .leading)
            .chartYAxis {
                AxisMarks(position: .leading)
            }
            .frame(height: 230)
        }
        .dsCard()
    }

    private var historyCard: some View {
        VStack(alignment: .leading, spacing: DSSpacing.sm) {
            Text("History")
                .font(DSTypography.subtitle)

            ForEach(viewModel.history.prefix(14)) { row in
                HStack {
                    Text(formatDate(row.dateKey))
                    Spacer()
                    Label("\(row.completedSessions)", systemImage: "timer")
                        .foregroundStyle(DSColor.focus)
                    Text(formatMinutes(row.focusMinutes))
                        .foregroundStyle(DSColor.secondaryText)
                        .monospacedDigit()
                }
                Divider()
            }
        }
        .dsCard()
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: DSSpacing.xs) {
            Text("No statistics recorded yet")
                .font(DSTypography.subtitle)
            Text("Complete a few sessions to unlock trend and history insights.")
                .foregroundStyle(DSColor.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dsCard()
    }

    private var chartRows: [ChartRow] {
        viewModel.history.compactMap { row in
            guard let date = dateFromISO(row.dateKey) else { return nil }
            return ChartRow(date: date, completedSessions: row.completedSessions, focusMinutes: row.focusMinutes)
        }
        .sorted { $0.date < $1.date }
    }

    private func formatMinutes(_ minutes: Int) -> String {
        let safeMinutes = max(minutes, 0)
        let hours = safeMinutes / 60
        let remainingMinutes = safeMinutes % 60

        if hours == 0 {
            return "\(remainingMinutes)m"
        }

        return "\(hours)h \(remainingMinutes)m"
    }

    private func formatDate(_ key: String) -> String {
        guard let date = dateFromISO(key) else {
            return key
        }

        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }

    private func dateFromISO(_ key: String) -> Date? {
        let parser = DateFormatter()
        parser.calendar = Calendar(identifier: .gregorian)
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = .current
        parser.dateFormat = "yyyy-MM-dd"
        return parser.date(from: key)
    }
}

private struct ChartRow: Identifiable {
    let date: Date
    let completedSessions: Int
    let focusMinutes: Int

    var id: Date { date }
}
