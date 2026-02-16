import AppKit
import AppShell
import CoreDI
import CoreInterfaces
import JiraIntegration
import PlatformServices
import SwiftUI

@main
struct TomatoFocusApp: App {
    private let container = AppContainer(
        dependencies: AppDependencies(
            notifications: NotificationService(),
            storage: UserDefaultsStorageService(),
            scheduler: TimerSchedulerService(),
            idleMonitor: IdleMonitorService(),
            jira: JiraService()
        )
    )

    var body: some Scene {
        WindowGroup {
            RootNavigationView(container: container)
        }
    }
}
