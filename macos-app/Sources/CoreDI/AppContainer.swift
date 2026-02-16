import CoreInterfaces
import Foundation

public struct AppDependencies {
    public let notifications: NotificationServicing
    public let storage: StorageServicing
    public let scheduler: SchedulingServicing
    public let idleMonitor: IdleMonitoring
    public let jira: JiraServicing

    public init(
        notifications: NotificationServicing,
        storage: StorageServicing,
        scheduler: SchedulingServicing,
        idleMonitor: IdleMonitoring,
        jira: JiraServicing
    ) {
        self.notifications = notifications
        self.storage = storage
        self.scheduler = scheduler
        self.idleMonitor = idleMonitor
        self.jira = jira
    }
}

public final class AppContainer {
    public let dependencies: AppDependencies

    public init(dependencies: AppDependencies) {
        self.dependencies = dependencies
    }
}
