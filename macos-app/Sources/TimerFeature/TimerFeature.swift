import CoreInterfaces
import SwiftUI

@MainActor
public final class TimerViewModel: ObservableObject {
    @Published public private(set) var secondsRemaining: Int
    @Published public private(set) var isRunning = false
    @Published public private(set) var currentSession = 1
    @Published public private(set) var sessionKind: SessionKind = .work

    public var isWorkSession: Bool {
        sessionKind.isWorkSession
    }

    public var fullSessionDurationSeconds: Int {
        let settings = currentSettings
        switch sessionKind {
        case .work:
            return settings.focusDurationMinutes * 60
        case .shortBreak:
            return settings.shortBreakMinutes * 60
        case .longBreak:
            return settings.longBreakMinutes * 60
        }
    }

    private let notifications: NotificationServicing
    private let scheduler: SchedulingServicing
    private let storage: StorageServicing
    private let timerIdentifier = "pomodoro.timer"
    private var endTimestamp: Date?

    public init(notifications: NotificationServicing, scheduler: SchedulingServicing, storage: StorageServicing) {
        self.notifications = notifications
        self.scheduler = scheduler
        self.storage = storage

        let recovered = storage.loadTimerState()
        self.secondsRemaining = recovered.secondsRemaining
        self.isRunning = recovered.isRunning
        self.currentSession = recovered.currentSession
        self.sessionKind = recovered.sessionKind
        self.endTimestamp = recovered.endTimestamp

        recoverStateAfterLaunch(from: recovered)

        Task {
            await notifications.requestAuthorization()
        }
    }

    public func start() {
        guard !isRunning else { return }

        if secondsRemaining <= 0 {
            completeCurrentSession()
            return
        }

        isRunning = true
        persistAndSchedule(withSecondsRemaining: secondsRemaining)
    }

    public func pause() {
        guard isRunning else { return }

        updateSecondsFromWallClock()
        isRunning = false
        scheduler.cancelTask(identifier: timerIdentifier)
        endTimestamp = nil
        persist()
    }

    public func reset() {
        let settings = currentSettings
        isRunning = false
        currentSession = 1
        sessionKind = .work
        secondsRemaining = settings.focusDurationMinutes * 60
        endTimestamp = nil
        scheduler.cancelTask(identifier: timerIdentifier)
        persist()
    }

    public func skipBreak() {
        guard !isWorkSession else { return }

        let settings = currentSettings
        currentSession += 1
        sessionKind = .work
        secondsRemaining = settings.focusDurationMinutes * 60

        scheduler.cancelTask(identifier: timerIdentifier)

        let shouldRun = settings.autoStart || isRunning
        isRunning = shouldRun

        if shouldRun {
            persistAndSchedule(withSecondsRemaining: secondsRemaining)
        } else {
            endTimestamp = nil
            persist()
        }
    }

    private var currentSettings: AppSettings {
        storage.loadSettings()
    }

    private func recoverStateAfterLaunch(from state: TimerState) {
        guard state.isRunning else {
            endTimestamp = nil
            persist()
            return
        }

        var recovered = state
        let now = Date()

        if recovered.endTimestamp == nil {
            recovered.endTimestamp = now.addingTimeInterval(TimeInterval(max(recovered.secondsRemaining, 1)))
        }

        while recovered.isRunning {
            guard let savedEnd = recovered.endTimestamp else { break }
            let remaining = Int(ceil(savedEnd.timeIntervalSince(now)))
            if remaining > 0 {
                recovered.secondsRemaining = remaining
                break
            }

            recovered = transitionAfterCompletion(from: recovered)
        }

        isRunning = recovered.isRunning
        currentSession = recovered.currentSession
        sessionKind = recovered.sessionKind
        secondsRemaining = max(recovered.secondsRemaining, 0)
        endTimestamp = recovered.endTimestamp

        if recovered.isRunning {
            persistAndSchedule(withSecondsRemaining: secondsRemaining)
        } else {
            scheduler.cancelTask(identifier: timerIdentifier)
            endTimestamp = nil
            persist()
        }
    }

    private func persistAndSchedule(withSecondsRemaining seconds: Int) {
        let duration = max(seconds, 1)
        endTimestamp = Date().addingTimeInterval(TimeInterval(duration))

        scheduler.cancelTask(identifier: timerIdentifier)
        scheduler.scheduleRepeatingTask(identifier: timerIdentifier, interval: 1) { [weak self] in
            Task { @MainActor in
                self?.tick()
            }
        }

        persist()
    }

    private func tick() {
        guard isRunning else { return }

        updateSecondsFromWallClock()

        if secondsRemaining <= 0 {
            completeCurrentSession()
        }
    }

    private func updateSecondsFromWallClock() {
        guard let endTimestamp else { return }
        secondsRemaining = max(Int(ceil(endTimestamp.timeIntervalSinceNow)), 0)
    }

    private func completeCurrentSession() {
        scheduler.cancelTask(identifier: timerIdentifier)

        let previousKind = sessionKind
        if previousKind == .work {
            storage.incrementPomodoroForCurrentTask()

            var stats = storage.loadStats()
            stats.recordCompletedSession(focusMinutes: currentSettings.focusDurationMinutes)
            stats.pruneHistory()
            storage.saveStats(stats)
        }

        let transitioned = transitionAfterCompletion(from: currentState())
        apply(transitioned)

        Task {
            await notifications.dispatchSessionBoundaryAlert(
                title: "Tomato Focus",
                body: previousKind == .work ? "Work session complete" : "Break session complete",
                playSound: currentSettings.playSound,
                volume: currentSettings.volume
            )
        }

        if isRunning {
            persistAndSchedule(withSecondsRemaining: secondsRemaining)
        } else {
            endTimestamp = nil
            persist()
        }
    }

    private func transitionAfterCompletion(from state: TimerState) -> TimerState {
        let settings = currentSettings

        if state.sessionKind == .work {
            let cadence = max(settings.longBreakInterval, 1)
            let shouldUseLongBreak = state.currentSession % cadence == 0
            let nextKind: SessionKind = shouldUseLongBreak ? .longBreak : .shortBreak
            let nextDuration = shouldUseLongBreak ? settings.longBreakMinutes * 60 : settings.shortBreakMinutes * 60

            return TimerState(
                isRunning: settings.autoStart,
                secondsRemaining: nextDuration,
                endTimestamp: nil,
                currentSession: state.currentSession,
                sessionKind: nextKind
            )
        }

        return TimerState(
            isRunning: settings.autoStart,
            secondsRemaining: settings.focusDurationMinutes * 60,
            endTimestamp: nil,
            currentSession: state.currentSession + 1,
            sessionKind: .work
        )
    }

    private func apply(_ state: TimerState) {
        isRunning = state.isRunning
        secondsRemaining = state.secondsRemaining
        currentSession = state.currentSession
        sessionKind = state.sessionKind
        endTimestamp = state.endTimestamp
    }

    private func currentState() -> TimerState {
        TimerState(
            isRunning: isRunning,
            secondsRemaining: secondsRemaining,
            endTimestamp: endTimestamp,
            currentSession: currentSession,
            sessionKind: sessionKind
        )
    }

    private func persist() {
        storage.saveTimerState(currentState())
    }
}

public struct TimerView: View {
    @ObservedObject private var viewModel: TimerViewModel

    public init(viewModel: TimerViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        VStack(spacing: 16) {
            Text(sessionTitle)
                .font(.title2)
            Text(timeString)
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
            HStack {
                Button(viewModel.isRunning ? "Pause" : startButtonTitle) {
                    viewModel.isRunning ? viewModel.pause() : viewModel.start()
                }

                Button("Reset") {
                    viewModel.reset()
                }

                Button("Skip Break") {
                    viewModel.skipBreak()
                }
                .disabled(viewModel.isWorkSession)
            }
        }
        .padding()
    }

    private var sessionTitle: String {
        switch viewModel.sessionKind {
        case .work:
            return "Work Session"
        case .shortBreak:
            return "Short Break"
        case .longBreak:
            return "Long Break"
        }
    }

    private var startButtonTitle: String {
        let isResume = viewModel.secondsRemaining > 0 && viewModel.secondsRemaining < viewModel.fullSessionDurationSeconds
        return isResume ? "Resume" : "Start"
    }

    private var timeString: String {
        let minutes = viewModel.secondsRemaining / 60
        let seconds = viewModel.secondsRemaining % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
