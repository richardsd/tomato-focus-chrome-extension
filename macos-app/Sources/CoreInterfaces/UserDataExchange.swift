import Foundation

public enum UserDataConflictPolicy: String, Equatable {
    case sourceFileReplacesLocal
}

public struct UserDataImportReport: Equatable {
    public let schemaVersion: Int
    public let importedTaskCount: Int
    public let importedStatisticsDayCount: Int

    public init(schemaVersion: Int, importedTaskCount: Int, importedStatisticsDayCount: Int) {
        self.schemaVersion = schemaVersion
        self.importedTaskCount = importedTaskCount
        self.importedStatisticsDayCount = importedStatisticsDayCount
    }
}

public enum UserDataImportError: LocalizedError, Equatable {
    case malformedJSON
    case unsupportedSchemaID(String)
    case unsupportedSchemaVersion(Int)
    case unsupportedConflictPolicy(String)
    case validation([String])

    public var errorDescription: String? {
        switch self {
        case .malformedJSON:
            return "The selected file is not valid Tomato Focus exchange JSON."
        case .unsupportedSchemaID(let schemaID):
            return "Unsupported file type: \(schemaID)."
        case .unsupportedSchemaVersion(let version):
            return "This file uses schema version \(version), which is newer than this app supports."
        case .unsupportedConflictPolicy(let policy):
            return "Unsupported conflict policy: \(policy)."
        case .validation(let errors):
            return (["Could not import file due to invalid data:"] + errors.map { "• \($0)" }).joined(separator: "\n")
        }
    }
}

public struct UserDataImportPayload: Equatable {
    public let schemaVersion: Int
    public let conflictPolicy: UserDataConflictPolicy
    public let settings: AppSettings
    public let tasks: [TaskItem]
    public let currentTaskID: UUID?
    public let stats: PomodoroStats
    public let timerState: TimerState

    public static func parse(from jsonData: Data) throws -> UserDataImportPayload {
        guard
            let rawObject = try? JSONSerialization.jsonObject(with: jsonData),
            let rawDictionary = rawObject as? [String: Any]
        else {
            throw UserDataImportError.malformedJSON
        }

        let envelope = try migrateIfNeeded(rawDictionary)

        let schemaID = string(from: envelope["schemaId"])
        guard schemaID == "com.tomatofocus.user-data" else {
            throw UserDataImportError.unsupportedSchemaID(schemaID)
        }

        let schemaVersion = int(from: envelope["schemaVersion"])
        guard schemaVersion <= 1 else {
            throw UserDataImportError.unsupportedSchemaVersion(schemaVersion)
        }

        let policyRaw = string(from: envelope["conflictPolicy"])
        guard let policy = UserDataConflictPolicy(rawValue: policyRaw) else {
            throw UserDataImportError.unsupportedConflictPolicy(policyRaw)
        }

        guard let data = envelope["data"] as? [String: Any] else {
            throw UserDataImportError.validation(["Missing root data object"])
        }

        let (settings, settingsErrors) = parseSettings(data["settings"])
        let taskResult = parseTasks(data["tasks"])
        let statsResult = parseStatistics(data["statistics"])
        let timerResult = parseTimer(data["timer"], settings: settings)

        var errors = settingsErrors + taskResult.errors + statsResult.errors + timerResult.errors

        let currentTaskRaw = optionalString(from: data["currentTaskId"])
        let currentTaskID: UUID?
        if let currentTaskRaw {
            currentTaskID = taskResult.idMap[currentTaskRaw]
            if currentTaskID == nil {
                errors.append("Current task id does not exist in imported task list")
            }
        } else {
            currentTaskID = nil
        }

        if !errors.isEmpty {
            throw UserDataImportError.validation(errors)
        }

        return UserDataImportPayload(
            schemaVersion: schemaVersion,
            conflictPolicy: policy,
            settings: settings,
            tasks: taskResult.tasks,
            currentTaskID: currentTaskID,
            stats: statsResult.stats,
            timerState: timerResult.timer
        )
    }

    private static func migrateIfNeeded(_ raw: [String: Any]) throws -> [String: Any] {
        if raw["schemaVersion"] != nil {
            return raw
        }

        // Legacy migration: older exports may contain the extension state directly at root.
        let looksLikeLegacyState = raw["settings"] != nil || raw["tasks"] != nil || raw["statistics"] != nil
        guard looksLikeLegacyState else {
            throw UserDataImportError.malformedJSON
        }

        return [
            "schemaId": "com.tomatofocus.user-data",
            "schemaVersion": 1,
            "conflictPolicy": "sourceFileReplacesLocal",
            "data": [
                "settings": raw["settings"] ?? [:],
                "tasks": raw["tasks"] ?? [],
                "statistics": raw["statistics"] ?? [:],
                "currentTaskId": raw["currentTaskId"] as Any,
                "timer": [
                    "isRunning": raw["isRunning"] as Any,
                    "timeLeft": raw["timeLeft"] as Any,
                    "endTime": raw["endTime"] as Any,
                    "currentSession": raw["currentSession"] as Any,
                    "isWorkSession": raw["isWorkSession"] as Any
                ]
            ]
        ]
    }

    private static func parseSettings(_ raw: Any?) -> (AppSettings, [String]) {
        guard let raw = raw as? [String: Any] else {
            return (AppSettings(), ["Missing settings object"])
        }

        var settings = AppSettings()
        settings.focusDurationMinutes = max(1, int(from: raw["workDuration"], fallback: 25))
        settings.shortBreakMinutes = max(1, int(from: raw["shortBreak"], fallback: 5))
        settings.longBreakMinutes = max(1, int(from: raw["longBreak"], fallback: 15))
        settings.longBreakInterval = max(1, int(from: raw["longBreakInterval"], fallback: 4))
        settings.autoStart = bool(from: raw["autoStart"])
        settings.theme = AppTheme(rawValue: string(from: raw["theme"], fallback: "system")) ?? .system
        settings.pauseOnIdle = bool(from: raw["pauseOnIdle"], fallback: true)
        settings.playSound = bool(from: raw["playSound"], fallback: true)
        settings.volume = min(1, max(0, double(from: raw["volume"], fallback: 0.7)))
        settings.jiraURL = string(from: raw["jiraUrl"], fallback: "")
        settings.jiraUsername = string(from: raw["jiraUsername"], fallback: "")
        settings.jiraToken = string(from: raw["jiraToken"], fallback: "")
        settings.autoSyncJira = bool(from: raw["autoSyncJira"])
        settings.jiraSyncIntervalMinutes = min(720, max(5, int(from: raw["jiraSyncInterval"], fallback: 30)))

        return (settings, [])
    }

    private static func parseTasks(_ raw: Any?) -> (tasks: [TaskItem], idMap: [String: UUID], errors: [String]) {
        guard let rawTasks = raw as? [[String: Any]] else {
            return ([], [:], ["Tasks must be an array"])
        }

        var tasks: [TaskItem] = []
        var idMap: [String: UUID] = [:]
        var seenIDs = Set<UUID>()
        var errors: [String] = []

        for (index, rawTask) in rawTasks.enumerated() {
            let rawID = string(from: rawTask["id"], fallback: "")
            let title = string(from: rawTask["title"], fallback: "").trimmingCharacters(in: .whitespacesAndNewlines)
            if title.isEmpty {
                errors.append("Task #\(index + 1) is missing a title")
                continue
            }

            let uuid = UUID(uuidString: rawID) ?? UUID()
            if seenIDs.contains(uuid) {
                errors.append("Task #\(index + 1) has a duplicate id")
                continue
            }
            seenIDs.insert(uuid)
            idMap[rawID] = uuid

            let estimated = max(1, int(from: rawTask["estimatedPomodoros"], fallback: 1))
            let completed = max(0, int(from: rawTask["completedPomodoros"], fallback: 0))
            let isCompleted = bool(from: rawTask["isCompleted"])

            tasks.append(TaskItem(
                id: uuid,
                title: title,
                details: string(from: rawTask["description"], fallback: ""),
                estimatedPomodoros: estimated,
                completedPomodoros: completed,
                isCompleted: isCompleted,
                createdAt: date(from: rawTask["createdAt"]) ?? Date(),
                completedAt: date(from: rawTask["completedAt"])
            ))
        }

        return (tasks, idMap, errors)
    }

    private static func parseStatistics(_ raw: Any?) -> (stats: PomodoroStats, errors: [String]) {
        guard let rawStats = raw as? [String: Any] else {
            return (PomodoroStats(), ["Statistics must be an object"])
        }

        var daily: [String: DailyPomodoroStats] = [:]
        var errors: [String] = []

        for (dateKey, value) in rawStats {
            guard let day = value as? [String: Any] else {
                errors.append("Statistics entry \(dateKey) is invalid")
                continue
            }

            let completed = max(0, int(from: day["completedToday"], fallback: 0))
            let focus = max(0, int(from: day["focusTimeToday"], fallback: 0))
            daily[dateKey] = DailyPomodoroStats(completedSessions: completed, focusMinutes: focus)
        }

        return (PomodoroStats(daily: daily), errors)
    }

    private static func parseTimer(_ raw: Any?, settings: AppSettings) -> (timer: TimerState, errors: [String]) {
        guard let rawTimer = raw as? [String: Any] else {
            return (TimerState(secondsRemaining: settings.focusDurationMinutes * 60), ["Missing timer object"])
        }

        let isWork = bool(from: rawTimer["isWorkSession"], fallback: true)
        return (
            TimerState(
                isRunning: bool(from: rawTimer["isRunning"]),
                secondsRemaining: max(0, int(from: rawTimer["timeLeft"], fallback: settings.focusDurationMinutes * 60)),
                endTimestamp: dateOrEpochMillis(from: rawTimer["endTime"]),
                currentSession: max(1, int(from: rawTimer["currentSession"], fallback: 1)),
                sessionKind: isWork ? .work : .shortBreak
            ),
            []
        )
    }

    private static func string(from raw: Any?, fallback: String = "") -> String {
        if let value = raw as? String { return value }
        if let value = raw as? NSNumber { return value.stringValue }
        return fallback
    }

    private static func optionalString(from raw: Any?) -> String? {
        guard let value = raw else { return nil }
        let converted = string(from: value, fallback: "")
        return converted.isEmpty ? nil : converted
    }

    private static func int(from raw: Any?, fallback: Int = 0) -> Int {
        if let value = raw as? Int { return value }
        if let value = raw as? NSNumber { return value.intValue }
        if let value = raw as? String, let parsed = Int(value) { return parsed }
        return fallback
    }

    private static func double(from raw: Any?, fallback: Double = 0) -> Double {
        if let value = raw as? Double { return value }
        if let value = raw as? NSNumber { return value.doubleValue }
        if let value = raw as? String, let parsed = Double(value) { return parsed }
        return fallback
    }

    private static func bool(from raw: Any?, fallback: Bool = false) -> Bool {
        if let value = raw as? Bool { return value }
        if let value = raw as? NSNumber { return value.boolValue }
        if let value = raw as? String { return ["true", "1", "yes"].contains(value.lowercased()) }
        return fallback
    }

    private static func date(from raw: Any?) -> Date? {
        guard let stringValue = raw as? String else { return nil }
        return ISO8601DateFormatter().date(from: stringValue)
    }

    private static func dateOrEpochMillis(from raw: Any?) -> Date? {
        if let date = date(from: raw) {
            return date
        }
        if let millis = raw as? NSNumber {
            return Date(timeIntervalSince1970: millis.doubleValue / 1000)
        }
        if let intMillis = raw as? Int {
            return Date(timeIntervalSince1970: Double(intMillis) / 1000)
        }
        return nil
    }
}
