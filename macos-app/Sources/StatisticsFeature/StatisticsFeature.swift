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

                if viewModel.history.isEmpty {
                    emptyState
                } else {
                    chartsRow
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

    private var chartsRow: some View {
        HStack(alignment: .top, spacing: DSSpacing.sm) {
            completedSessionsChart
            focusMinutesChart
        }
    }

    private var completedSessionsChart: some View {
        chartContainer(title: "Completed sessions") {
            Chart(chartRows) { row in
                BarMark(
                    x: .value("Day", row.date, unit: .day),
                    y: .value("Sessions", row.completedSessions)
                )
                .foregroundStyle(DSColor.focus.gradient)
                .cornerRadius(4)
            }
            .chartYAxis {
                AxisMarks(position: .leading)
            }
        }
    }

    private var focusMinutesChart: some View {
        chartContainer(title: "Focus minutes") {
            Chart(chartRows) { row in
                LineMark(
                    x: .value("Day", row.date, unit: .day),
                    y: .value("Minutes", row.focusMinutes)
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(DSColor.shortBreak)
                .lineStyle(StrokeStyle(lineWidth: 2))

                PointMark(
                    x: .value("Day", row.date, unit: .day),
                    y: .value("Minutes", row.focusMinutes)
                )
                .foregroundStyle(DSColor.shortBreak)
                .symbolSize(row.focusMinutes > 0 ? 24 : 0)
            }
            .chartYAxis {
                AxisMarks(position: .leading)
            }
        }
    }

    private func chartContainer<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: DSSpacing.sm) {
            Text(title)
                .font(DSTypography.subtitle)

            content()
                .frame(height: 220)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        let calendar = Calendar(identifier: .gregorian)
        let today = calendar.startOfDay(for: Date())

        return (0..<30).reversed().compactMap { offset in
            guard let date = calendar.date(byAdding: .day, value: -offset, to: today) else {
                return nil
            }

            let key = isoKey(from: date)
            let stats = viewModel.stats.daily[key] ?? DailyPomodoroStats()
            return ChartRow(
                date: date,
                completedSessions: stats.completedSessions,
                focusMinutes: stats.focusMinutes
            )
        }
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

    private func isoKey(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

private struct ChartRow: Identifiable {
    let date: Date
    let completedSessions: Int
    let focusMinutes: Int

    var id: Date { date }
}
