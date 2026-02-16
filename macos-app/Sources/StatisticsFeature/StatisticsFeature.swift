import CoreInterfaces
import SwiftUI

@MainActor
public final class StatisticsViewModel: ObservableObject {
    @Published public private(set) var stats: PomodoroStats

    private let storage: StorageServicing

    public init(storage: StorageServicing) {
        self.storage = storage
        self.stats = storage.loadStats()
    }

    public func recordSession(minutes: Int) {
        stats.completedSessions += 1
        stats.focusMinutes += minutes
        storage.saveStats(stats)
    }
}

public struct StatisticsView: View {
    @ObservedObject private var viewModel: StatisticsViewModel

    public init(viewModel: StatisticsViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Statistics")
                .font(.title2)
            Text("Completed sessions: \(viewModel.stats.completedSessions)")
            Text("Focus minutes: \(viewModel.stats.focusMinutes)")
        }
        .padding()
    }
}
