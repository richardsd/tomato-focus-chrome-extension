import AVFoundation
import AppKit
import CoreInterfaces
import Foundation
import UserNotifications

public final class NotificationService: NSObject, NotificationServicing {
    private let notificationCenter: UNUserNotificationCenter
    private var audioPlayer: AVAudioPlayer?

    public override init() {
        self.notificationCenter = UNUserNotificationCenter.current()
        super.init()
    }

    public func requestAuthorization() async {
        _ = try? await notificationCenter.requestAuthorization(options: [.alert, .sound])
    }

    public func dispatchSessionBoundaryAlert(title: String, body: String, playSound: Bool, volume: Double) async {
        let settings = await notificationCenter.notificationSettings()

        if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional || settings.authorizationStatus == .ephemeral {
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = nil

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: trigger)
            do {
                try await notificationCenter.add(request)
            } catch {
                NSLog("Failed to schedule local notification: \(error.localizedDescription)")
            }
        } else {
            await MainActor.run {
                NSApplication.shared.requestUserAttention(.informationalRequest)
            }
            NSLog("Notification permission denied/restricted; using attention request + sound fallback")
        }

        guard playSound else { return }
        await playBoundarySound(volume: volume)
    }

    private func playBoundarySound(volume: Double) async {
        let normalizedVolume = Float(max(0, min(1, volume)))

        do {
            guard let soundURL = Bundle.module.url(forResource: "notification", withExtension: "mp3") else {
                throw NSError(domain: "NotificationService", code: 404, userInfo: [NSLocalizedDescriptionKey: "notification.mp3 not found in bundle"])
            }

            let player = try AVAudioPlayer(contentsOf: soundURL)
            player.volume = normalizedVolume
            player.prepareToPlay()
            player.play()
            audioPlayer = player
        } catch {
            NSLog("Custom notification audio failed: \(error.localizedDescription). Falling back to system beep.")
            await MainActor.run {
                NSSound.beep()
            }
        }
    }
}

public final class UserDefaultsStorageService: StorageServicing {
    private enum Keys {
        static let tasks = "tasks"
        static let currentTaskID = "currentTaskID"
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
        NotificationCenter.default.post(name: .tasksDidChange, object: nil)
    }

    public func loadCurrentTaskID() -> UUID? {
        guard let rawID = defaults.string(forKey: Keys.currentTaskID) else {
            return nil
        }
        return UUID(uuidString: rawID)
    }

    public func saveCurrentTaskID(_ taskID: UUID?) {
        defaults.set(taskID?.uuidString, forKey: Keys.currentTaskID)
        NotificationCenter.default.post(name: .currentTaskDidChange, object: nil)
    }

    @discardableResult
    public func incrementPomodoroForCurrentTask() -> TaskItem? {
        guard let currentTaskID = loadCurrentTaskID() else {
            return nil
        }

        var tasks = loadTasks()
        guard let index = tasks.firstIndex(where: { $0.id == currentTaskID }) else {
            saveCurrentTaskID(nil)
            return nil
        }

        tasks[index].completedPomodoros += 1
        saveTasks(tasks)
        return tasks[index]
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
        NotificationCenter.default.post(name: .statsDidChange, object: nil)
    }

    public func clearStats() {
        defaults.removeObject(forKey: Keys.stats)
        NotificationCenter.default.post(name: .statsDidChange, object: nil)
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

    @discardableResult
    public func importExtensionUserData(_ data: Data) throws -> UserDataImportReport {
        let payload = try UserDataImportPayload.parse(from: data)

        // Conflict policy is enforced here: sourceFileReplacesLocal overwrites local model values.
        saveSettings(payload.settings)
        saveTasks(payload.tasks)
        saveCurrentTaskID(payload.currentTaskID)
        saveStats(payload.stats)
        saveTimerState(payload.timerState)

        return UserDataImportReport(
            schemaVersion: payload.schemaVersion,
            importedTaskCount: payload.tasks.count,
            importedStatisticsDayCount: payload.stats.daily.count
        )
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
