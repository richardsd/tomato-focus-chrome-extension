import CoreInterfaces
import Foundation
import UserNotifications

public final class NotificationService: NotificationServicing {
    public init() {}

    public func requestAuthorization() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
    }

    public func scheduleNotification(title: String, body: String, in seconds: TimeInterval) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(seconds, 1), repeats: false)
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
    }
}

public final class UserDefaultsStorageService: StorageServicing {
    private enum Keys {
        static let tasks = "tasks"
        static let stats = "stats"
        static let settings = "settings"
        static let timerState = "timerState"
    }

    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func loadTasks() -> [TaskItem] {
        decode([TaskItem].self, forKey: Keys.tasks) ?? []
    }

    public func saveTasks(_ tasks: [TaskItem]) {
        encode(tasks, forKey: Keys.tasks)
    }

    public func loadSettings() -> AppSettings {
        decode(AppSettings.self, forKey: Keys.settings) ?? AppSettings()
    }

    public func saveSettings(_ settings: AppSettings) {
        encode(settings, forKey: Keys.settings)
    }

    public func loadStats() -> PomodoroStats {
        decode(PomodoroStats.self, forKey: Keys.stats) ?? PomodoroStats()
    }

    public func saveStats(_ stats: PomodoroStats) {
        encode(stats, forKey: Keys.stats)
    }

    public func loadTimerState() -> TimerState {
        let state = decode(TimerState.self, forKey: Keys.timerState) ?? TimerState()
        if state.secondsRemaining > 0 {
            return state
        }

        var repaired = state
        let settings = loadSettings()
        repaired.secondsRemaining = settings.focusDurationMinutes * 60
        repaired.endTimestamp = nil
        repaired.isRunning = false
        repaired.currentSession = max(repaired.currentSession, 1)
        repaired.sessionKind = .work
        return repaired
    }

    public func saveTimerState(_ state: TimerState) {
        encode(state, forKey: Keys.timerState)
    }

    private func encode<T: Encodable>(_ value: T, forKey key: String) {
        guard let data = try? encoder.encode(value) else { return }
        defaults.set(data, forKey: key)
    }

    private func decode<T: Decodable>(_ type: T.Type, forKey key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? decoder.decode(type, from: data)
    }
}

public final class TimerSchedulerService: SchedulingServicing {
    private var timers: [String: Timer] = [:]

    public init() {}

    public func scheduleRepeatingTask(identifier: String, interval: TimeInterval, action: @escaping () -> Void) {
        cancelTask(identifier: identifier)
        timers[identifier] = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            action()
        }
    }

    public func cancelTask(identifier: String) {
        timers[identifier]?.invalidate()
        timers[identifier] = nil
    }
}

public struct IdleMonitorService: IdleMonitoring {
    public init() {}

    public var idleTimeSeconds: TimeInterval {
        // Placeholder implementation for initial scaffold.
        0
    }
}
