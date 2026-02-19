import CoreInterfaces
import DesignSystem
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
    @State private var pauseDetectionModeSelection: PauseDetectionMode = .both

    public init(viewModel: SettingsViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DSSpacing.lg) {
                Text("Settings")
                    .font(DSTypography.title)

                timerSettings
                behaviorSettings
                soundSettings
                jiraSettings
                dataExchangeSettings

                if !viewModel.validationErrors.isEmpty {
                    validationErrorsCard
                }

                saveCard
            }
            .padding(DSSpacing.xl)
            .frame(maxWidth: 980, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(DSColor.pageBackground.ignoresSafeArea())
        .onAppear {
            pauseDetectionModeSelection = viewModel.settings.pauseDetectionMode
        }
        .onChange(of: viewModel.settings.pauseDetectionMode) { mode in
            if pauseDetectionModeSelection != mode {
                pauseDetectionModeSelection = mode
            }
        }
        .onChange(of: pauseDetectionModeSelection) { mode in
            if viewModel.settings.pauseDetectionMode != mode {
                // Defer model publication to the next runloop tick to avoid publish-during-update warnings.
                DispatchQueue.main.async {
                    viewModel.settings.pauseDetectionMode = mode
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
    }

    private var timerSettings: some View {
        SettingsCard(title: "Durations", subtitle: "Define your default focus and break cadence.") {
            Stepper("Work: \(viewModel.settings.focusDurationMinutes) min", value: $viewModel.settings.focusDurationMinutes, in: 1...180)
            Stepper("Short break: \(viewModel.settings.shortBreakMinutes) min", value: $viewModel.settings.shortBreakMinutes, in: 1...60)
            Stepper("Long break: \(viewModel.settings.longBreakMinutes) min", value: $viewModel.settings.longBreakMinutes, in: 1...120)
            Stepper("Sessions before long break: \(viewModel.settings.longBreakInterval)", value: $viewModel.settings.longBreakInterval, in: 1...12)
        }
    }

    private var behaviorSettings: some View {
        SettingsCard(title: "Behavior", subtitle: "Choose how sessions transition and how appearance follows your preferences.") {
            Toggle("Auto-start next session", isOn: $viewModel.settings.autoStart)
            Toggle("Pause and resume timer based on idle activity", isOn: $viewModel.settings.pauseOnIdle)

            Picker("Pause Detection", selection: $pauseDetectionModeSelection) {
                ForEach(PauseDetectionMode.allCases, id: \.self) { mode in
                    Text(mode.displayName).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .disabled(!viewModel.settings.pauseOnIdle)

            Text(pauseDetectionHelpText)
                .font(.footnote)
                .foregroundStyle(DSColor.secondaryText)

            Picker("Theme", selection: $viewModel.settings.theme) {
                ForEach(AppTheme.allCases, id: \.self) { theme in
                    Text(theme.displayName).tag(theme)
                }
            }
            .pickerStyle(.segmented)
        }
    }

    private var soundSettings: some View {
        SettingsCard(title: "Sound", subtitle: "Customize audible feedback at session boundaries.") {
            Toggle("Enable timer sound", isOn: $viewModel.settings.playSound)
            HStack {
                Text("Volume")
                Slider(value: $viewModel.settings.volume, in: 0...1)
                Text("\(Int(viewModel.settings.volume * 100))%")
                    .monospacedDigit()
                    .foregroundStyle(DSColor.secondaryText)
            }
        }
    }

    private var pauseDetectionHelpText: String {
        switch viewModel.settings.pauseDetectionMode {
        case .idleOnly:
            return "Idle only pauses on inactivity threshold."
        case .lockOnly:
            return "Lock screen only pauses on lock and auto-resumes on unlock if lock caused the pause."
        case .both:
            return "Both uses inactivity and lock events; unlock resumes only lock-triggered pauses."
        }
    }

    private var jiraSettings: some View {
        SettingsCard(title: "Jira Integration", subtitle: "Connect Jira to import assigned unresolved issues into your task list.") {
            TextField("Jira URL", text: $viewModel.settings.jiraURL)
                .textFieldStyle(.roundedBorder)
            TextField("Jira username", text: $viewModel.settings.jiraUsername)
                .textFieldStyle(.roundedBorder)
            SecureField("Jira API token", text: $viewModel.settings.jiraToken)
                .textFieldStyle(.roundedBorder)
            Toggle("Auto-sync Jira tasks", isOn: $viewModel.settings.autoSyncJira)
            Stepper(
                "Sync interval: \(viewModel.settings.jiraSyncIntervalMinutes) min",
                value: $viewModel.settings.jiraSyncIntervalMinutes,
                in: 5...720,
                step: 5
            )
        }
    }

    private var dataExchangeSettings: some View {
        SettingsCard(title: "Data Exchange", subtitle: "Import extension data using the replace-local conflict policy.") {
            Text("Conflict policy: source file replaces all local settings, tasks, statistics, current task, and timer state.")
                .font(.footnote)
                .foregroundStyle(DSColor.secondaryText)

            Button("Import extension data JSON…") {
                isImportingExchangeFile = true
            }
            .buttonStyle(DSSecondaryButtonStyle())
        }
    }

    private var validationErrorsCard: some View {
        VStack(alignment: .leading, spacing: DSSpacing.xs) {
            Label("Validation Errors", systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(DSColor.warning)

            ForEach(viewModel.validationErrors, id: \.self) { error in
                Text(error)
                    .font(.subheadline)
                    .foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dsCard()
    }

    private var saveCard: some View {
        HStack {
            Button("Save Settings", action: viewModel.save)
                .buttonStyle(DSPrimaryButtonStyle())

            if !viewModel.saveStatusMessage.isEmpty {
                Text(viewModel.saveStatusMessage)
                    .foregroundStyle(DSColor.focus)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dsCard()
    }
}

private struct SettingsCard<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: DSSpacing.sm) {
            Text(title)
                .font(DSTypography.subtitle)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(DSColor.secondaryText)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dsCard()
    }
}
