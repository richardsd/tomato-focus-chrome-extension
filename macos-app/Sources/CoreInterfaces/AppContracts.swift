import Foundation

public struct TaskItem: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var details: String
    public var estimatedPomodoros: Int
    public var completedPomodoros: Int
    public var isCompleted: Bool
    public var createdAt: Date
    public var completedAt: Date?

    public init(
        id: UUID = UUID(),
        title: String,
        details: String = "",
        estimatedPomodoros: Int = 1,
        completedPomodoros: Int = 0,
        isCompleted: Bool = false,
        createdAt: Date = Date(),
        completedAt: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.details = details
        self.estimatedPomodoros = max(estimatedPomodoros, 1)
        self.completedPomodoros = max(completedPomodoros, 0)
        self.isCompleted = isCompleted
        self.createdAt = createdAt
        self.completedAt = completedAt
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case title
        case details
        case estimatedPomodoros
        case completedPomodoros
        case isCompleted
        case createdAt
        case completedAt
        case isDone
        case description
    }


    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(title, forKey: .title)
        try container.encode(details, forKey: .details)
        try container.encode(estimatedPomodoros, forKey: .estimatedPomodoros)
        try container.encode(completedPomodoros, forKey: .completedPomodoros)
        try container.encode(isCompleted, forKey: .isCompleted)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encodeIfPresent(completedAt, forKey: .completedAt)
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Untitled Task"

        let legacyDescription = try container.decodeIfPresent(String.self, forKey: .description)
        details = try container.decodeIfPresent(String.self, forKey: .details) ?? legacyDescription ?? ""

        estimatedPomodoros = max(try container.decodeIfPresent(Int.self, forKey: .estimatedPomodoros) ?? 1, 1)
        completedPomodoros = max(try container.decodeIfPresent(Int.self, forKey: .completedPomodoros) ?? 0, 0)

        let legacyDone = try container.decodeIfPresent(Bool.self, forKey: .isDone)
        isCompleted = try container.decodeIfPresent(Bool.self, forKey: .isCompleted) ?? legacyDone ?? false

        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        completedAt = try container.decodeIfPresent(Date.self, forKey: .completedAt)
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
    func loadCurrentTaskID() -> UUID?
    func saveCurrentTaskID(_ taskID: UUID?)
    @discardableResult
    func incrementPomodoroForCurrentTask() -> TaskItem?
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

public extension Notification.Name {
    static let tasksDidChange = Notification.Name("tomatoFocus.tasksDidChange")
    static let currentTaskDidChange = Notification.Name("tomatoFocus.currentTaskDidChange")
}
