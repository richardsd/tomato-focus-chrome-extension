import CoreInterfaces
import SwiftUI

@MainActor
public final class TimerViewModel: ObservableObject {
    @Published public private(set) var secondsRemaining: Int
    @Published public private(set) var isRunning = false

    private let notifications: NotificationServicing
    private let scheduler: SchedulingServicing

    public init(notifications: NotificationServicing, scheduler: SchedulingServicing, initialSeconds: Int = 25 * 60) {
        self.notifications = notifications
        self.scheduler = scheduler
        self.secondsRemaining = initialSeconds
    }

    public func start() {
        guard !isRunning else { return }
        isRunning = true
        scheduler.scheduleRepeatingTask(identifier: "pomodoro.timer", interval: 1) { [weak self] in
            Task { @MainActor in
                self?.tick()
            }
        }
    }

    public func stop() {
        isRunning = false
        scheduler.cancelTask(identifier: "pomodoro.timer")
    }

    private func tick() {
        guard isRunning else { return }
        guard secondsRemaining > 0 else {
            stop()
            notifications.scheduleNotification(title: "Pomodoro Complete", body: "Time for a break!", in: 1)
            return
        }
        secondsRemaining -= 1
    }
}

public struct TimerView: View {
    @ObservedObject private var viewModel: TimerViewModel

    public init(viewModel: TimerViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        VStack(spacing: 16) {
            Text("Focus Timer")
                .font(.title2)
            Text(timeString)
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
            HStack {
                Button(viewModel.isRunning ? "Pause" : "Start") {
                    viewModel.isRunning ? viewModel.stop() : viewModel.start()
                }
            }
        }
        .padding()
    }

    private var timeString: String {
        let minutes = viewModel.secondsRemaining / 60
        let seconds = viewModel.secondsRemaining % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
