import CoreInterfaces
import DesignSystem
import Foundation
import SwiftUI

@MainActor
public final class TimerViewModel: ObservableObject {
    @Published public private(set) var secondsRemaining: Int
    @Published public private(set) var isRunning = false
    @Published public private(set) var currentSession = 1
    @Published public private(set) var sessionKind: SessionKind = .work
    @Published public private(set) var currentTaskTitle: String?
    @Published public private(set) var autoPauseStatusMessage: String?

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
    private let idleMonitor: IdleMonitoring
    private let timerIdentifier = "pomodoro.timer"
    private let idlePauseThresholdSeconds: TimeInterval = 60
    private var endTimestamp: Date?
    private var isCompletingSession = false
    private var observers: [NSObjectProtocol] = []
    private var screenStateObservers: [NSObjectProtocol] = []
    private var lastAutoPauseReason: AutoPauseReason?

    private enum AutoPauseReason {
        case idle
        case lock
    }

    public init(
        notifications: NotificationServicing,
        scheduler: SchedulingServicing,
        storage: StorageServicing,
        idleMonitor: IdleMonitoring
    ) {
        self.notifications = notifications
        self.scheduler = scheduler
        self.storage = storage
        self.idleMonitor = idleMonitor

        let recovered = storage.loadTimerState()
        self.secondsRemaining = recovered.secondsRemaining
        self.isRunning = recovered.isRunning
        self.currentSession = recovered.currentSession
        self.sessionKind = recovered.sessionKind
        self.endTimestamp = recovered.endTimestamp
        self.currentTaskTitle = nil
        self.autoPauseStatusMessage = nil

        recoverStateAfterLaunch(from: recovered)
        refreshCurrentTaskContext()
        setupObservers()
        setupScreenStateObservers()

        Task {
            await notifications.requestAuthorization()
        }
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
        for observer in screenStateObservers {
            DistributedNotificationCenter.default().removeObserver(observer)
        }
    }

    public func start() {
        guard !isRunning else { return }

        if secondsRemaining <= 0 {
            completeCurrentSession()
            return
        }

        clearAutoPauseState()
        isRunning = true
        persistAndSchedule(withSecondsRemaining: secondsRemaining)
    }

    public func pause() {
        guard isRunning else { return }

        updateSecondsFromWallClock()
        isRunning = false
        scheduler.cancelTask(identifier: timerIdentifier)
        endTimestamp = nil
        clearAutoPauseState()
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
        clearAutoPauseState()
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
        clearAutoPauseState()

        if shouldRun {
            persistAndSchedule(withSecondsRemaining: secondsRemaining)
        } else {
            endTimestamp = nil
            persist()
        }
    }

    public func toggle() {
        isRunning ? pause() : start()
    }

    public func startQuickTimer(minutes: Int) {
        guard minutes > 0 else { return }

        sessionKind = .work
        secondsRemaining = minutes * 60
        isRunning = true
        clearAutoPauseState()

        persistAndSchedule(withSecondsRemaining: secondsRemaining)
    }

    private var currentSettings: AppSettings {
        storage.loadSettings()
    }

    private func setupObservers() {
        let tasksObserver = NotificationCenter.default.addObserver(
            forName: .tasksDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.refreshCurrentTaskContext()
            }
        }

        let currentTaskObserver = NotificationCenter.default.addObserver(
            forName: .currentTaskDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.refreshCurrentTaskContext()
            }
        }

        observers = [tasksObserver, currentTaskObserver]
    }

    private func setupScreenStateObservers() {
        let distributedCenter = DistributedNotificationCenter.default()
        let lockedObserver = distributedCenter.addObserver(
            forName: Notification.Name("com.apple.screenIsLocked"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.handleScreenLocked()
            }
        }

        let unlockedObserver = distributedCenter.addObserver(
            forName: Notification.Name("com.apple.screenIsUnlocked"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.handleScreenUnlocked()
            }
        }

        screenStateObservers = [lockedObserver, unlockedObserver]
    }

    private func handleScreenLocked() {
        guard currentSettings.pauseOnIdle else { return }
        guard shouldHandleScreenLock else { return }
        guard isRunning else { return }
        pauseForAutoReason(.lock)
    }

    private func handleScreenUnlocked() {
        guard currentSettings.pauseOnIdle else { return }
        guard shouldHandleScreenLock else { return }
        guard lastAutoPauseReason == .lock else { return }
        guard !isRunning else { return }
        clearAutoPauseState()
        start()
    }

    private func refreshCurrentTaskContext() {
        guard let currentTaskID = storage.loadCurrentTaskID() else {
            currentTaskTitle = nil
            return
        }

        let activeTask = storage.loadTasks().first(where: { $0.id == currentTaskID })
        currentTaskTitle = activeTask?.title
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
        maybePauseForIdle()
        guard isRunning else { return }

        updateSecondsFromWallClock()

        if secondsRemaining <= 0 {
            completeCurrentSession()
        }
    }

    private var shouldHandleIdle: Bool {
        let mode = currentSettings.pauseDetectionMode
        return mode == .idleOnly || mode == .both
    }

    private var shouldHandleScreenLock: Bool {
        let mode = currentSettings.pauseDetectionMode
        return mode == .lockOnly || mode == .both
    }

    private func maybePauseForIdle() {
        guard currentSettings.pauseOnIdle else { return }
        guard shouldHandleIdle else { return }
        guard idleMonitor.idleTimeSeconds >= idlePauseThresholdSeconds else { return }
        guard isRunning else { return }
        pauseForAutoReason(.idle)
    }

    private func pauseForAutoReason(_ reason: AutoPauseReason) {
        guard isRunning else { return }
        updateSecondsFromWallClock()
        isRunning = false
        scheduler.cancelTask(identifier: timerIdentifier)
        endTimestamp = nil
        lastAutoPauseReason = reason
        switch reason {
        case .idle:
            autoPauseStatusMessage = "Paused due to inactivity"
        case .lock:
            autoPauseStatusMessage = "Paused due to screen lock"
        }
        persist()
    }

    private func clearAutoPauseState() {
        lastAutoPauseReason = nil
        autoPauseStatusMessage = nil
    }

    private func updateSecondsFromWallClock() {
        guard let endTimestamp else { return }
        secondsRemaining = max(Int(ceil(endTimestamp.timeIntervalSinceNow)), 0)
    }

    private func completeCurrentSession() {
        guard !isCompletingSession else { return }
        isCompletingSession = true
        defer { isCompletingSession = false }
        clearAutoPauseState()

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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(viewModel: TimerViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: DSSpacing.lg) {
                headerCard
                timerCard
                quickStartCard
            }
            .padding(DSSpacing.xl)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(
            LinearGradient(
                colors: [
                    sessionTint.opacity(0.14),
                    DSColor.pageBackground,
                    DSColor.tertiaryBackground.opacity(0.6)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        )
        .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.86), value: viewModel.sessionKind)
    }

    private var headerCard: some View {
        HStack(alignment: .center, spacing: DSSpacing.md) {
            VStack(alignment: .leading, spacing: DSSpacing.xs) {
                Text("Focus Session")
                    .font(.caption)
                    .foregroundStyle(DSColor.secondaryText)

                Text(sessionTitle)
                    .font(DSTypography.title)

                Text("Cycle #\(viewModel.currentSession)")
                    .font(.subheadline)
                    .foregroundStyle(DSColor.secondaryText)
            }

            Spacer()

            statusChips
        }
        .dsCard()
    }

    private var timerCard: some View {
        VStack(spacing: DSSpacing.lg) {
            ZStack {
                DSTimerRing(progress: progress, tint: sessionTint)
                    .frame(width: 280, height: 280)

                VStack(spacing: DSSpacing.xxs) {
                    Text(timeString)
                        .font(DSTypography.metric)
                        .monospacedDigit()

                    Text(viewModel.isRunning ? "Session in progress" : "Ready to focus")
                        .font(.subheadline)
                        .foregroundStyle(DSColor.secondaryText)
                }
            }

            if !viewModel.isRunning, let autoPauseStatusMessage = viewModel.autoPauseStatusMessage {
                Text(autoPauseStatusMessage)
                    .font(.subheadline)
                    .foregroundStyle(DSColor.warning)
            }

            if let currentTaskTitle = viewModel.currentTaskTitle, !currentTaskTitle.isEmpty {
                HStack(spacing: DSSpacing.xs) {
                    Image(systemName: "scope")
                        .foregroundStyle(sessionTint)
                    Text("Current task: \(currentTaskTitle)")
                        .font(.subheadline)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, DSSpacing.xs)
            }

            HStack(spacing: DSSpacing.sm) {
                Button(viewModel.isRunning ? "Pause" : startButtonTitle) {
                    viewModel.toggle()
                }
                .buttonStyle(DSPrimaryButtonStyle())
                .accessibilityLabel(viewModel.isRunning ? "Pause timer" : "Start timer")

                Button("Reset") {
                    viewModel.reset()
                }
                .buttonStyle(DSSecondaryButtonStyle())

                Button("Skip Break") {
                    viewModel.skipBreak()
                }
                .buttonStyle(DSSecondaryButtonStyle())
                .disabled(viewModel.isWorkSession)
            }
        }
        .padding(DSSpacing.xl)
        .frame(maxWidth: .infinity)
        .dsCard(padded: false)
    }

    private var quickStartCard: some View {
        VStack(alignment: .leading, spacing: DSSpacing.sm) {
            Text("Quick Start")
                .font(DSTypography.subtitle)

            Text("Launch a focused work sprint instantly.")
                .font(.subheadline)
                .foregroundStyle(DSColor.secondaryText)

            HStack(spacing: DSSpacing.sm) {
                quickStartButton(minutes: 5)
                quickStartButton(minutes: 15)
                quickStartButton(minutes: 25, suffix: "Focus")
                quickStartButton(minutes: 45)
                Spacer()
            }
        }
        .dsCard()
    }

    private var statusChips: some View {
        HStack(spacing: DSSpacing.xs) {
            statusChip(label: "Work", isSelected: viewModel.sessionKind == .work, tint: DSColor.focus)
            statusChip(label: "Short", isSelected: viewModel.sessionKind == .shortBreak, tint: DSColor.shortBreak)
            statusChip(label: "Long", isSelected: viewModel.sessionKind == .longBreak, tint: DSColor.longBreak)
        }
    }

    private func statusChip(label: String, isSelected: Bool, tint: Color) -> some View {
        Text(label)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, DSSpacing.sm)
            .padding(.vertical, DSSpacing.xs)
            .background(
                Capsule(style: .continuous)
                    .fill(isSelected ? tint.opacity(0.18) : Color.primary.opacity(0.06))
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(isSelected ? tint.opacity(0.45) : Color.primary.opacity(0.08), lineWidth: 1)
            )
            .foregroundStyle(isSelected ? tint : Color.primary)
    }

    private func quickStartButton(minutes: Int, suffix: String = "") -> some View {
        Button {
            viewModel.startQuickTimer(minutes: minutes)
        } label: {
            Text(suffix.isEmpty ? "\(minutes)m" : "\(minutes)m \(suffix)")
        }
        .buttonStyle(DSSecondaryButtonStyle())
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

    private var sessionTint: Color {
        switch viewModel.sessionKind {
        case .work:
            return DSColor.focus
        case .shortBreak:
            return DSColor.shortBreak
        case .longBreak:
            return DSColor.longBreak
        }
    }

    private var progress: Double {
        let total = max(viewModel.fullSessionDurationSeconds, 1)
        return Double(max(viewModel.secondsRemaining, 0)) / Double(total)
    }

    private var timeString: String {
        let minutes = max(viewModel.secondsRemaining, 0) / 60
        let seconds = max(viewModel.secondsRemaining, 0) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
