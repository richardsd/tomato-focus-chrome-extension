import CoreInterfaces
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
            self?.refreshFromStorage()
        }

        let taskObserver = NotificationCenter.default.addObserver(
            forName: .tasksDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // Keep statistics view synchronized when task edits/deletions occur.
            self?.refreshFromStorage()
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
        VStack(alignment: .leading, spacing: 16) {
            Text("Statistics")
                .font(.title2)

            GroupBox {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Completed today: \(viewModel.completedSessionsToday)", systemImage: "checkmark.circle")
                    Label("Total focus time: \(formatMinutes(viewModel.totalFocusMinutes))", systemImage: "clock")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("History")
                    .font(.headline)

                if viewModel.history.isEmpty {
                    Text("No statistics recorded yet — complete sessions to see history.")
                        .foregroundStyle(.secondary)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(viewModel.history) { row in
                                HStack {
                                    Text(formatDate(row.dateKey))
                                    Spacer()
                                    Text("\(row.completedSessions) 🍅 · \(formatMinutes(row.focusMinutes))")
                                        .foregroundStyle(.secondary)
                                }
                                Divider()
                            }
                        }
                    }
                }
            }

            HStack {
                Spacer()
                Button("Clear Statistics", role: .destructive) {
                    viewModel.requestClearAllStatistics()
                }
            }
        }
        .padding()
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
        let parser = DateFormatter()
        parser.calendar = Calendar(identifier: .gregorian)
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = .current
        parser.dateFormat = "yyyy-MM-dd"

        guard let date = parser.date(from: key) else {
            return key
        }

        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }
}
