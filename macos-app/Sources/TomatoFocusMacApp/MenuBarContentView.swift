import AppKit
import DesignSystem
import SwiftUI
import TimerFeature

struct MenuBarContentView: View {
    @ObservedObject var timerViewModel: TimerViewModel
    let mainWindowID: String
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: DSSpacing.md) {
            header

            HStack(spacing: DSSpacing.xs) {
                Button(timerViewModel.isRunning ? "Pause" : startButtonTitle) {
                    timerViewModel.toggle()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)

                Button("Reset") {
                    timerViewModel.reset()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                Button("Skip") {
                    timerViewModel.skipBreak()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(timerViewModel.isWorkSession)
                .help(skipButtonHelpText)
            }

            Menu("Quick Start") {
                Button("5 minutes") { timerViewModel.startQuickTimer(minutes: 5) }
                Button("15 minutes") { timerViewModel.startQuickTimer(minutes: 15) }
                Button("25 minutes (Focus)") { timerViewModel.startQuickTimer(minutes: 25) }
                Button("45 minutes") { timerViewModel.startQuickTimer(minutes: 45) }
            }
            .controlSize(.small)

            Divider()

            VStack(alignment: .leading, spacing: DSSpacing.xs) {
                HoverMenuRowButton(title: "Open Main Window") {
                    openOrFocusMainWindow()
                }

                HoverMenuRowButton(
                    title: "Quit Tomato Focus",
                    isDestructive: true
                ) {
                    NSApp.terminate(nil)
                }
            }
        }
        .frame(minWidth: 304, idealWidth: 320)
        .padding(DSSpacing.sm)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: DSSpacing.xxs) {
            HStack(alignment: .firstTextBaseline) {
                Text(sessionSummary)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text(timeString)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(sessionTint)
            }

            Text(timerViewModel.isRunning ? "Running" : pausedStateMessage)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
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

    private var pausedStateMessage: String {
        if let autoPauseStatusMessage = timerViewModel.autoPauseStatusMessage {
            return autoPauseStatusMessage
        }
        return "Paused"
    }

    private var skipButtonHelpText: String {
        timerViewModel.isWorkSession ? "Skip is available only during break sessions." : "Skip current break and return to work."
    }

    private func openOrFocusMainWindow() {
        let presentingWindow = NSApp.keyWindow
        NSApp.activate(ignoringOtherApps: true)

        if let existing = NSApp.windows.first(where: { $0.title == "Tomato Focus" }) {
            existing.makeKeyAndOrderFront(nil)
        } else {
            openWindow(id: mainWindowID)
        }

        presentingWindow?.orderOut(nil)
    }

    private var timeString: String {
        let remaining = max(timerViewModel.secondsRemaining, 0)
        let minutes = remaining / 60
        let seconds = remaining % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

private struct HoverMenuRowButton: View {
    let title: String
    let isDestructive: Bool
    let action: () -> Void
    @State private var isHovering = false

    init(title: String, isDestructive: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.isDestructive = isDestructive
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.body)
                .foregroundStyle(isDestructive ? Color.red : Color.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, DSSpacing.xs)
                .padding(.vertical, DSSpacing.xxs)
                .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(
                    Color(nsColor: .selectedContentBackgroundColor)
                        .opacity(isHovering ? 0.22 : 0.0)
                )
        )
        .onHover { hovering in
            isHovering = hovering
        }
        .animation(.easeOut(duration: 0.08), value: isHovering)
    }
}
