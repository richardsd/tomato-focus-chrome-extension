import Foundation

public struct TaskItem: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var isDone: Bool

    public init(id: UUID = UUID(), title: String, isDone: Bool = false) {
        self.id = id
        self.title = title
        self.isDone = isDone
    }
}

public struct PomodoroStats: Codable, Equatable {
    public var completedSessions: Int
    public var focusMinutes: Int

    public init(completedSessions: Int = 0, focusMinutes: Int = 0) {
        self.completedSessions = completedSessions
        self.focusMinutes = focusMinutes
    }
}

public struct AppSettings: Codable, Equatable {
    public var focusDurationMinutes: Int
    public var shortBreakMinutes: Int
    public var longBreakMinutes: Int
    public var longBreakInterval: Int
    public var autoStart: Bool

    public init(
        focusDurationMinutes: Int = 25,
        shortBreakMinutes: Int = 5,
        longBreakMinutes: Int = 15,
        longBreakInterval: Int = 4,
        autoStart: Bool = false
    ) {
        self.focusDurationMinutes = focusDurationMinutes
        self.shortBreakMinutes = shortBreakMinutes
        self.longBreakMinutes = longBreakMinutes
        self.longBreakInterval = longBreakInterval
        self.autoStart = autoStart
    }
}

public enum SessionKind: String, Codable, Equatable {
    case work
    case shortBreak
    case longBreak

    public var isWorkSession: Bool {
        self == .work
    }
}

public struct TimerState: Codable, Equatable {
    public var isRunning: Bool
    public var secondsRemaining: Int
    public var endTimestamp: Date?
    public var currentSession: Int
    public var sessionKind: SessionKind

    public init(
        isRunning: Bool = false,
        secondsRemaining: Int = 25 * 60,
        endTimestamp: Date? = nil,
        currentSession: Int = 1,
        sessionKind: SessionKind = .work
    ) {
        self.isRunning = isRunning
        self.secondsRemaining = secondsRemaining
        self.endTimestamp = endTimestamp
        self.currentSession = currentSession
        self.sessionKind = sessionKind
    }
}

public protocol NotificationServicing {
    func requestAuthorization() async
    func scheduleNotification(title: String, body: String, in seconds: TimeInterval)
}

public protocol StorageServicing {
    func loadTasks() -> [TaskItem]
    func saveTasks(_ tasks: [TaskItem])
    func loadSettings() -> AppSettings
    func saveSettings(_ settings: AppSettings)
    func loadStats() -> PomodoroStats
    func saveStats(_ stats: PomodoroStats)
    func loadTimerState() -> TimerState
    func saveTimerState(_ state: TimerState)
}

public protocol SchedulingServicing {
    func scheduleRepeatingTask(identifier: String, interval: TimeInterval, action: @escaping () -> Void)
    func cancelTask(identifier: String)
}

public protocol IdleMonitoring {
    var idleTimeSeconds: TimeInterval { get }
}

public protocol JiraServicing {
    func fetchAssignedIssues() async throws -> [TaskItem]
}
