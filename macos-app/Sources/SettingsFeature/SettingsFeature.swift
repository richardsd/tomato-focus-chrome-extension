import CoreInterfaces
import SwiftUI

@MainActor
public final class SettingsViewModel: ObservableObject {
    @Published public var settings: AppSettings

    private let storage: StorageServicing

    public init(storage: StorageServicing) {
        self.storage = storage
        self.settings = storage.loadSettings()
    }

    public func save() {
        storage.saveSettings(settings)
    }
}

public struct SettingsView: View {
    @ObservedObject private var viewModel: SettingsViewModel

    public init(viewModel: SettingsViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        Form {
            Stepper("Focus: \(viewModel.settings.focusDurationMinutes) min", value: $viewModel.settings.focusDurationMinutes, in: 10...90)
            Stepper("Short break: \(viewModel.settings.shortBreakMinutes) min", value: $viewModel.settings.shortBreakMinutes, in: 1...30)
            Stepper("Long break: \(viewModel.settings.longBreakMinutes) min", value: $viewModel.settings.longBreakMinutes, in: 5...60)
            Button("Save", action: viewModel.save)
        }
        .padding()
    }
}
