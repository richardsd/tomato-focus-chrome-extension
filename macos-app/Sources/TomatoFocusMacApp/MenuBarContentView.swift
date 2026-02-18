import AppKit
import DesignSystem
import SwiftUI
import TimerFeature

struct MenuBarContentView: View {
    @ObservedObject var timerViewModel: TimerViewModel
    let mainWindowID: String
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: DSSpacing.sm) {
            HStack {
                Text(sessionSummary)
                    .font(.headline)
                Spacer()
                Text(timeString)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(sessionTint)
            }

            HStack(spacing: DSSpacing.xs) {
                Button(timerViewModel.isRunning ? "Pause" : startButtonTitle) {
                    timerViewModel.toggle()
                }
                .buttonStyle(DSPrimaryButtonStyle())

                Button("Reset") {
                    timerViewModel.reset()
                }
                .buttonStyle(DSSecondaryButtonStyle())

                Button("Skip") {
                    timerViewModel.skipBreak()
                }
                .buttonStyle(DSSecondaryButtonStyle())
                .disabled(timerViewModel.isWorkSession)
            }

            Menu("Quick Start") {
                Button("5 minutes") { timerViewModel.startQuickTimer(minutes: 5) }
                Button("15 minutes") { timerViewModel.startQuickTimer(minutes: 15) }
                Button("25 minutes (Focus)") { timerViewModel.startQuickTimer(minutes: 25) }
                Button("45 minutes") { timerViewModel.startQuickTimer(minutes: 45) }
            }

            Divider()

            Button("Open Main Window") {
                NSApp.activate(ignoringOtherApps: true)
                openWindow(id: mainWindowID)
            }

            Button("Quit Tomato Focus") {
                NSApp.terminate(nil)
            }
        }
        .padding(.vertical, DSSpacing.xs)
        .padding(.horizontal, DSSpacing.xxs)
    }

    private var sessionSummary: String {
        switch timerViewModel.sessionKind {
        case .work:
            return "Work Session"
        case .shortBreak:
            return "Short Break"
        case .longBreak:
            return "Long Break"
        }
    }

    private var sessionTint: Color {
        switch timerViewModel.sessionKind {
        case .work:
            return DSColor.focus
        case .shortBreak:
            return DSColor.shortBreak
        case .longBreak:
            return DSColor.longBreak
        }
    }

    private var startButtonTitle: String {
        let full = timerViewModel.fullSessionDurationSeconds
        let remaining = timerViewModel.secondsRemaining
        let isResume = remaining > 0 && remaining < full
        return isResume ? "Resume" : "Start"
    }

    private var timeString: String {
        let remaining = max(timerViewModel.secondsRemaining, 0)
        let minutes = remaining / 60
        let seconds = remaining % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
