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
        VStack(spacing: 0) {
            TabView {
                generalTab
                    .tabItem {
                        Label("General", systemImage: "gearshape")
                    }

                jiraTab
                    .tabItem {
                        Label("Jira", systemImage: "link")
                    }

                dataTab
                    .tabItem {
                        Label("Data", systemImage: "arrow.triangle.2.circlepath")
                    }
            }

            Divider()

            settingsFooter
        }
        .frame(width: 680, height: 560)
        .background(DSColor.pageBackground)
        .preferredColorScheme(colorScheme(for: viewModel.settings.theme))
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

    private var generalTab: some View {
        settingsTabContent {
            SettingsPanel(title: "Durations") {
                NumberStepperInputRow(
                    label: "Work",
                    suffix: "min",
                    value: $viewModel.settings.focusDurationMinutes,
                    range: 1...180,
                    labelWidth: 220
                )
                NumberStepperInputRow(
                    label: "Short break",
                    suffix: "min",
                    value: $viewModel.settings.shortBreakMinutes,
                    range: 1...60,
                    labelWidth: 220
                )
                NumberStepperInputRow(
                    label: "Long break",
                    suffix: "min",
                    value: $viewModel.settings.longBreakMinutes,
                    range: 1...120,
                    labelWidth: 220
                )
                NumberStepperInputRow(
                    label: "Sessions before long break",
                    suffix: "",
                    value: $viewModel.settings.longBreakInterval,
                    range: 1...12,
                    labelWidth: 220
                )
            }

            SettingsPanel(title: "Behavior") {
                Toggle("Auto-start next session", isOn: $viewModel.settings.autoStart)
                Toggle("Pause and resume timer based on idle activity", isOn: $viewModel.settings.pauseOnIdle)

                LabeledSettingsRow(label: "Pause detection") {
                    Picker("Pause detection", selection: $pauseDetectionModeSelection) {
                        ForEach(PauseDetectionMode.allCases, id: \.self) { mode in
                            Text(mode.displayName).tag(mode)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                    .disabled(!viewModel.settings.pauseOnIdle)
                }

                Text(pauseDetectionHelpText)
                    .font(.footnote)
                    .foregroundStyle(DSColor.secondaryText)

                LabeledSettingsRow(label: "Theme") {
                    Picker("Theme", selection: $viewModel.settings.theme) {
                        ForEach(AppTheme.allCases, id: \.self) { theme in
                            Text(theme.displayName).tag(theme)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                }
            }

            SettingsPanel(title: "Sound") {
                Toggle("Enable timer sound", isOn: $viewModel.settings.playSound)

                LabeledSettingsRow(label: "Volume") {
                    Slider(value: $viewModel.settings.volume, in: 0...1)
                    Text("\(Int(viewModel.settings.volume * 100))%")
                        .frame(width: 44, alignment: .trailing)
                        .monospacedDigit()
                        .foregroundStyle(DSColor.secondaryText)
                }
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

    private var jiraTab: some View {
        settingsTabContent {
            SettingsPanel(title: "Connection") {
                TextField("Jira URL", text: $viewModel.settings.jiraURL)
                    .textFieldStyle(.roundedBorder)
                TextField("Jira username", text: $viewModel.settings.jiraUsername)
                    .textFieldStyle(.roundedBorder)
                SecureField("Jira API token", text: $viewModel.settings.jiraToken)
                    .textFieldStyle(.roundedBorder)
            }

            SettingsPanel(title: "Sync") {
                Toggle("Auto-sync Jira tasks", isOn: $viewModel.settings.autoSyncJira)
                NumberStepperInputRow(
                    label: "Sync interval",
                    suffix: "min",
                    value: $viewModel.settings.jiraSyncIntervalMinutes,
                    range: 5...720,
                    step: 5,
                    labelWidth: 160
                )
            }
        }
    }

    private var dataTab: some View {
        settingsTabContent {
            SettingsPanel(title: "Data Exchange") {
                Text("Import extension data using the replace-local conflict policy.")
                    .foregroundStyle(DSColor.secondaryText)
                Text("Source files replace all local settings, tasks, statistics, current task, and timer state.")
                    .font(.footnote)
                    .foregroundStyle(DSColor.secondaryText)

                Button("Import extension data JSON...") {
                    isImportingExchangeFile = true
                }
                .buttonStyle(DSSecondaryButtonStyle())
            }
        }
    }

    private var settingsFooter: some View {
        VStack(alignment: .leading, spacing: DSSpacing.xs) {
            if !viewModel.validationErrors.isEmpty {
                VStack(alignment: .leading, spacing: DSSpacing.xxs) {
                    Label("Validation Errors", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(DSColor.warning)

                    ForEach(viewModel.validationErrors, id: \.self) { error in
                        Text(error)
                            .font(.subheadline)
                            .foregroundStyle(.red)
                    }
                }
            }

            HStack {
                Button("Save Settings", action: viewModel.save)
                    .buttonStyle(DSPrimaryButtonStyle())
                    .keyboardShortcut("s", modifiers: .command)

                if !viewModel.saveStatusMessage.isEmpty {
                    Text(viewModel.saveStatusMessage)
                        .foregroundStyle(DSColor.focus)
                }

                Spacer()
            }
        }
        .padding(DSSpacing.md)
    }

    private func colorScheme(for theme: AppTheme) -> ColorScheme? {
        switch theme {
        case .system:
            nil
        case .light:
            .light
        case .dark:
            .dark
        }
    }

    private func settingsTabContent<Content: View>(
        @ViewBuilder content: () -> Content
    ) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DSSpacing.md) {
                content()
            }
            .padding(DSSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct SettingsPanel<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: DSSpacing.sm) {
            Text(title)
                .font(DSTypography.subtitle)

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dsCard()
    }
}

private struct LabeledSettingsRow<Content: View>: View {
    let label: String
    @ViewBuilder let content: Content

    var body: some View {
        HStack(alignment: .center, spacing: DSSpacing.md) {
            Text(label)
                .frame(width: 150, alignment: .leading)

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct NumberStepperInputRow: View {
    let label: String
    let suffix: String
    @Binding var value: Int
    let range: ClosedRange<Int>
    let step: Int
    let labelWidth: CGFloat?

    init(
        label: String,
        suffix: String,
        value: Binding<Int>,
        range: ClosedRange<Int>,
        step: Int = 1,
        labelWidth: CGFloat? = nil
    ) {
        self.label = label
        self.suffix = suffix
        _value = value
        self.range = range
        self.step = step
        self.labelWidth = labelWidth
    }

    var body: some View {
        HStack(alignment: .center, spacing: DSSpacing.md) {
            if let labelWidth {
                Text(label)
                    .frame(width: labelWidth, alignment: .leading)
            } else {
                Text(label)
            }
            HStack(spacing: DSSpacing.xs) {
                TextField("", value: clampedValue, format: .number)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 72)
                Stepper("", value: clampedValue, in: range, step: step)
                    .labelsHidden()
                if !suffix.isEmpty {
                    Text(suffix)
                        .foregroundStyle(DSColor.secondaryText)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var clampedValue: Binding<Int> {
        Binding(
            get: { min(max(value, range.lowerBound), range.upperBound) },
            set: { newValue in
                value = min(max(newValue, range.lowerBound), range.upperBound)
            }
        )
    }
}
