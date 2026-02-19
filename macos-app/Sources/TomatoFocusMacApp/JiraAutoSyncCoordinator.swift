import CoreInterfaces
import Foundation

@MainActor
final class JiraAutoSyncCoordinator {
    private let storage: StorageServicing
    private let jira: JiraServicing
    private let scheduler: SchedulingServicing
    private let syncIdentifier = "jira.autoSync"
    private var isSyncInProgress = false
    private var observers: [NSObjectProtocol] = []

    init(storage: StorageServicing, jira: JiraServicing, scheduler: SchedulingServicing) {
        self.storage = storage
        self.jira = jira
        self.scheduler = scheduler
        setupObservers()
        configureFromSettings()
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
        scheduler.cancelTask(identifier: syncIdentifier)
    }

    private func setupObservers() {
        let settingsObserver = NotificationCenter.default.addObserver(
            forName: .settingsDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.configureFromSettings()
            }
        }
        observers = [settingsObserver]
    }

    private func configureFromSettings() {
        let settings = storage.loadSettings()
        scheduler.cancelTask(identifier: syncIdentifier)

        guard settings.autoSyncJira else { return }
        guard hasCompleteJiraConfiguration(settings) else {
            NSLog("Jira auto-sync disabled: missing Jira configuration.")
            return
        }

        let intervalMinutes = min(720, max(5, settings.jiraSyncIntervalMinutes))
        scheduler.scheduleRepeatingTask(
            identifier: syncIdentifier,
            interval: TimeInterval(intervalMinutes * 60)
        ) { [weak self] in
            Task { @MainActor [weak self] in
                await self?.performSync()
            }
        }
    }

    private func hasCompleteJiraConfiguration(_ settings: AppSettings) -> Bool {
        !settings.jiraURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !settings.jiraUsername.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !settings.jiraToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func performSync() async {
        guard !isSyncInProgress else { return }
        isSyncInProgress = true
        defer { isSyncInProgress = false }

        do {
            let imported = try await jira.fetchAssignedIssues()
            guard !imported.isEmpty else { return }

            var tasks = storage.loadTasks()
            let existingTitles = Set(tasks.map { $0.title.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) })
            let unique = imported.filter {
                !existingTitles.contains($0.title.lowercased().trimmingCharacters(in: .whitespacesAndNewlines))
            }
            guard !unique.isEmpty else { return }

            tasks.append(contentsOf: unique)
            storage.saveTasks(tasks)
            NSLog("Jira auto-sync imported \(unique.count) issue(s).")
        } catch {
            NSLog("Jira auto-sync failed: \(error.localizedDescription)")
        }
    }
}
