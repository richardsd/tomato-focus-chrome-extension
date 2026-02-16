import CoreInterfaces
import Foundation
import SwiftUI
import UniformTypeIdentifiers

@MainActor
public final class SettingsViewModel: ObservableObject {
    @Published public var settings: AppSettings
    @Published public private(set) var validationErrors: [String] = []
    @Published public private(set) var saveStatusMessage = ""

    private let storage: StorageServicing

    public init(storage: StorageServicing) {
        self.storage = storage
        self.settings = storage.loadSettings()
    }

    public func save() {
        let errors = validate(settings: settings)
        guard errors.isEmpty else {
            validationErrors = errors
            saveStatusMessage = ""
            return
        }

        validationErrors = []
        storage.saveSettings(settings)
        saveStatusMessage = "Settings saved."
    }

    public func importExtensionData(from fileURL: URL) {
        do {
            let fileData = try Data(contentsOf: fileURL)
            let report = try storage.importExtensionUserData(fileData)
            settings = storage.loadSettings()
            validationErrors = []
            saveStatusMessage = "Imported schema v\(report.schemaVersion): \(report.importedTaskCount) tasks, \(report.importedStatisticsDayCount) statistics days."
        } catch {
            validationErrors = [error.localizedDescription]
            saveStatusMessage = ""
        }
    }

    public func handleImportError(_ error: Error) {
        validationErrors = [error.localizedDescription]
        saveStatusMessage = ""
    }

    private func validate(settings: AppSettings) -> [String] {
        var errors: [String] = []

        if settings.focusDurationMinutes < 1 {
            errors.append("Work duration must be at least 1 minute")
        }
        if settings.shortBreakMinutes < 1 {
            errors.append("Short break must be at least 1 minute")
        }
        if settings.longBreakMinutes < settings.shortBreakMinutes {
            errors.append("Long break must be at least as long as the short break")
        }
        if settings.longBreakMinutes < 1 {
            errors.append("Long break must be at least 1 minute")
        }
        if settings.longBreakInterval < 1 || settings.longBreakInterval > 12 {
            errors.append("Sessions before long break must be between 1 and 12")
        }
        if settings.volume < 0 || settings.volume > 1 {
            errors.append("Volume must be between 0 and 1")
        }

        let hasAnyJira = !settings.jiraURL.isEmpty || !settings.jiraUsername.isEmpty || !settings.jiraToken.isEmpty
        let hasAllJira = !settings.jiraURL.isEmpty && !settings.jiraUsername.isEmpty && !settings.jiraToken.isEmpty
        if hasAnyJira && !hasAllJira {
            errors.append("Jira URL, username, and token are all required for Jira integration")
        }
        if settings.autoSyncJira && !hasAllJira {
            errors.append("Enable periodic sync only after entering Jira URL, username, and token")
        }
        if settings.jiraSyncIntervalMinutes < 5 || settings.jiraSyncIntervalMinutes > 720 {
            errors.append("Sync interval must be between 5 and 720 minutes")
        }

        if !settings.jiraURL.isEmpty && !isValidJiraURL(settings.jiraURL) {
            errors.append("Jira URL must be an https://<your-domain>.atlassian.net or https://<your-domain>.jira.com URL.")
        }

        return errors
    }

    private func isValidJiraURL(_ rawURL: String) -> Bool {
        guard let url = URL(string: rawURL), url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else {
            return false
        }
        return host.hasSuffix(".atlassian.net") || host.hasSuffix(".jira.com")
    }
}

public struct SettingsView: View {
    @ObservedObject private var viewModel: SettingsViewModel
    @State private var isImportingExchangeFile = false

    public init(viewModel: SettingsViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        Form {
            Section("Durations") {
                Stepper("Work: \(viewModel.settings.focusDurationMinutes) min", value: $viewModel.settings.focusDurationMinutes, in: 1...180)
                Stepper("Short break: \(viewModel.settings.shortBreakMinutes) min", value: $viewModel.settings.shortBreakMinutes, in: 1...60)
                Stepper("Long break: \(viewModel.settings.longBreakMinutes) min", value: $viewModel.settings.longBreakMinutes, in: 1...120)
                Stepper("Sessions before long break: \(viewModel.settings.longBreakInterval)", value: $viewModel.settings.longBreakInterval, in: 1...12)
            }

            Section("Behavior") {
                Toggle("Auto-start next session", isOn: $viewModel.settings.autoStart)
                Toggle("Pause and resume timer based on idle activity", isOn: $viewModel.settings.pauseOnIdle)

                Picker("Theme", selection: $viewModel.settings.theme) {
                    ForEach(AppTheme.allCases, id: \.self) { theme in
                        Text(theme.displayName).tag(theme)
                    }
                }
            }

            Section("Sound") {
                Toggle("Enable timer sound", isOn: $viewModel.settings.playSound)
                HStack {
                    Text("Volume")
                    Slider(value: $viewModel.settings.volume, in: 0...1)
                    Text("\(Int(viewModel.settings.volume * 100))%")
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }

            Section("Jira") {
                TextField("Jira URL", text: $viewModel.settings.jiraURL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                TextField("Jira username", text: $viewModel.settings.jiraUsername)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                SecureField("Jira API token", text: $viewModel.settings.jiraToken)
                Toggle("Auto-sync Jira tasks", isOn: $viewModel.settings.autoSyncJira)
                Stepper(
                    "Sync interval: \(viewModel.settings.jiraSyncIntervalMinutes) min",
                    value: $viewModel.settings.jiraSyncIntervalMinutes,
                    in: 5...720,
                    step: 5
                )
            }

            Section("Data exchange") {
                Text("Conflict policy: source file replaces all local settings, tasks, statistics, current task, and timer state.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Import extension data JSON…") {
                    isImportingExchangeFile = true
                }
            }

            if !viewModel.validationErrors.isEmpty {
                Section {
                    ForEach(viewModel.validationErrors, id: \.self) { error in
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }
            }

            Section {
                Button("Save", action: viewModel.save)
                if !viewModel.saveStatusMessage.isEmpty {
                    Text(viewModel.saveStatusMessage)
                        .foregroundStyle(.green)
                }
            }
        }
        .fileImporter(
            isPresented: $isImportingExchangeFile,
            allowedContentTypes: [.json],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let first = urls.first else { return }
                viewModel.importExtensionData(from: first)
            case .failure(let error):
                viewModel.handleImportError(error)
            }
        }
        .padding()
    }
}
