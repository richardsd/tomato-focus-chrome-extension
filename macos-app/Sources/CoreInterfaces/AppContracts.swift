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

    public init(focusDurationMinutes: Int = 25, shortBreakMinutes: Int = 5, longBreakMinutes: Int = 15) {
        self.focusDurationMinutes = focusDurationMinutes
        self.shortBreakMinutes = shortBreakMinutes
        self.longBreakMinutes = longBreakMinutes
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
