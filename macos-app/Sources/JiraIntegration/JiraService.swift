import CoreInterfaces
import Foundation

public struct JiraService: JiraServicing {
    public init() {}

    public func fetchAssignedIssues() async throws -> [TaskItem] {
        // Placeholder implementation for initial scaffold.
        [TaskItem(title: "TF-101 Setup pomodoro UX flow")]
    }
}
