import AppKit
import AppShell
import Combine
import CoreDI
import CoreInterfaces
import JiraIntegration
import PlatformServices
import SwiftUI
import TimerFeature

@main
struct TomatoFocusApp: App {
    @NSApplicationDelegateAdaptor(AppLifecycleDelegate.self) private var appDelegate
    private let container: AppContainer
    private let jiraAutoSyncCoordinator: JiraAutoSyncCoordinator
    private let mainWindowCoordinator: MainWindowCoordinator
    private let statusBarController: MenuBarStatusItemController
    @StateObject private var timerViewModel: TimerViewModel
    private let mainWindowID = "main"

    init() {
        let storage = UserDefaultsStorageService()
        let container = AppContainer(
            dependencies: AppDependencies(
                notifications: NotificationService(),
                storage: storage,
                scheduler: TimerSchedulerService(),
                idleMonitor: IdleMonitorService(),
                jira: JiraService(storage: storage)
            )
        )
        self.container = container
        self.jiraAutoSyncCoordinator = JiraAutoSyncCoordinator(
            storage: container.dependencies.storage,
            jira: container.dependencies.jira,
            scheduler: container.dependencies.scheduler
        )
        let mainWindowCoordinator = MainWindowCoordinator(mainWindowTitle: "Tomato Focus")
        self.mainWindowCoordinator = mainWindowCoordinator
        let timerViewModel = TimerViewModel(
            notifications: container.dependencies.notifications,
            scheduler: container.dependencies.scheduler,
            storage: container.dependencies.storage,
            idleMonitor: container.dependencies.idleMonitor
        )
        _timerViewModel = StateObject(
            wrappedValue: timerViewModel
        )
        self.statusBarController = MenuBarStatusItemController(
            timerViewModel: timerViewModel,
            mainWindowCoordinator: mainWindowCoordinator
        )
    }

    var body: some Scene {
        Window("Tomato Focus", id: mainWindowID) {
            RootNavigationView(container: container, timerViewModel: timerViewModel)
                .background(
                    MainWindowOpenActionBridge(
                        mainWindowID: mainWindowID,
                        coordinator: mainWindowCoordinator
                    )
                )
        }
        .commands {
            TimerQuickActionsCommands(timerViewModel: timerViewModel)
        }
    }
}

private final class AppLifecycleDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }
}

private struct TimerQuickActionsCommands: Commands {
    @ObservedObject var timerViewModel: TimerViewModel

    var body: some Commands {
        CommandMenu("Timer") {
            Button(timerViewModel.isRunning ? "Pause" : "Start") {
                timerViewModel.toggle()
            }
            .keyboardShortcut("s", modifiers: [.command, .shift])

            Button("Reset") {
                timerViewModel.reset()
            }
            .keyboardShortcut("r", modifiers: [.command, .shift])

            Button("Skip Break") {
                timerViewModel.skipBreak()
            }
            .keyboardShortcut("k", modifiers: [.command, .shift])
            .disabled(timerViewModel.isWorkSession)

            Divider()

            Menu("Quick Start") {
                Button("5 minutes") {
                    timerViewModel.startQuickTimer(minutes: 5)
                }

                Button("15 minutes") {
                    timerViewModel.startQuickTimer(minutes: 15)
                }

                Button("25 minutes (Focus)") {
                    timerViewModel.startQuickTimer(minutes: 25)
                }

                Button("45 minutes") {
                    timerViewModel.startQuickTimer(minutes: 45)
                }
            }
        }
    }
}

@MainActor
private final class MainWindowCoordinator {
    private let mainWindowTitle: String
    private var openWindowAction: (() -> Void)?

    init(mainWindowTitle: String) {
        self.mainWindowTitle = mainWindowTitle
    }

    func registerOpenWindowAction(_ action: @escaping () -> Void) {
        openWindowAction = action
    }

    func openOrFocusMainWindow() {
        NSApp.activate(ignoringOtherApps: true)

        if let existingWindow = NSApp.windows.first(where: { $0.title == mainWindowTitle }) {
            if existingWindow.isMiniaturized {
                existingWindow.deminiaturize(nil)
            }
            existingWindow.makeKeyAndOrderFront(nil)
            return
        }

        openWindowAction?()
    }
}

private struct MainWindowOpenActionBridge: View {
    let mainWindowID: String
    let coordinator: MainWindowCoordinator
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .onAppear {
                coordinator.registerOpenWindowAction {
                    openWindow(id: mainWindowID)
                }
            }
    }
}

@MainActor
private final class MenuBarStatusItemController: NSObject {
    private let timerViewModel: TimerViewModel
    private let mainWindowCoordinator: MainWindowCoordinator
    private let statusItem: NSStatusItem
    private let menu = NSMenu()
    private let sessionInfoItem = NSMenuItem()
    private let startPauseItem = NSMenuItem(title: "Start", action: nil, keyEquivalent: "")
    private let resetItem = NSMenuItem(title: "Reset", action: nil, keyEquivalent: "")
    private let skipBreakItem = NSMenuItem(title: "Skip Break", action: nil, keyEquivalent: "")
    private let quickStartItem = NSMenuItem(title: "Quick Start", action: nil, keyEquivalent: "")
    private let quickStartSubmenu = NSMenu()
    private let openMainWindowItem = NSMenuItem(title: "Open Main Window", action: nil, keyEquivalent: "")
    private let quitItem = NSMenuItem(title: "Quit Tomato Focus", action: nil, keyEquivalent: "")
    private var cancellables: Set<AnyCancellable> = []

    init(timerViewModel: TimerViewModel, mainWindowCoordinator: MainWindowCoordinator) {
        self.timerViewModel = timerViewModel
        self.mainWindowCoordinator = mainWindowCoordinator
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        super.init()
        configureStatusItem()
        configureMenu()
        bindTimerState()
        refreshMenuState()
    }

    private func configureStatusItem() {
        guard let button = statusItem.button else { return }
        button.imagePosition = .imageOnly
        button.font = .monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .medium)
        button.lineBreakMode = .byClipping
        button.setAccessibilityLabel("Tomato Focus Timer")
        statusItem.menu = menu
    }

    private func configureMenu() {
        menu.delegate = self

        sessionInfoItem.isEnabled = false
        menu.addItem(sessionInfoItem)
        menu.addItem(.separator())

        startPauseItem.target = self
        startPauseItem.action = #selector(handleStartPause)
        menu.addItem(startPauseItem)

        resetItem.target = self
        resetItem.action = #selector(handleReset)
        menu.addItem(resetItem)

        skipBreakItem.target = self
        skipBreakItem.action = #selector(handleSkipBreak)
        menu.addItem(skipBreakItem)

        quickStartItem.submenu = quickStartSubmenu
        quickStartSubmenu.autoenablesItems = false
        menu.addItem(quickStartItem)

        let quickStarts: [(String, Int)] = [
            ("5 minutes", 5),
            ("15 minutes", 15),
            ("25 minutes (Focus)", 25),
            ("45 minutes", 45)
        ]
        for (title, minutes) in quickStarts {
            let item = NSMenuItem(title: title, action: #selector(handleQuickStart(_:)), keyEquivalent: "")
            item.target = self
            item.tag = minutes
            quickStartSubmenu.addItem(item)
        }

        menu.addItem(.separator())

        openMainWindowItem.target = self
        openMainWindowItem.action = #selector(handleOpenMainWindow)
        menu.addItem(openMainWindowItem)

        quitItem.target = self
        quitItem.action = #selector(handleQuit)
        menu.addItem(quitItem)
    }

    private func bindTimerState() {
        Publishers.CombineLatest(timerViewModel.$secondsRemaining, timerViewModel.$isRunning)
            .receive(on: RunLoop.main)
            .sink { [weak self] secondsRemaining, isRunning in
                self?.updateStatusButton(secondsRemaining: secondsRemaining, isRunning: isRunning)
            }
            .store(in: &cancellables)
    }

    private func updateStatusButton(secondsRemaining: Int, isRunning: Bool) {
        guard let button = statusItem.button else { return }
        let font = NSFont.monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .medium)
        let symbolConfiguration = NSImage.SymbolConfiguration(scale: .medium)
        let icon = NSImage(systemSymbolName: isRunning ? "timer.circle.fill" : "timer", accessibilityDescription: nil)?
            .withSymbolConfiguration(symbolConfiguration)

        let attachment = NSTextAttachment()
        attachment.image = icon
        let iconSize = NSStatusBar.system.thickness - 6
        attachment.bounds = NSRect(x: 0, y: -1, width: iconSize, height: iconSize)

        let text = isRunning ? formatSeconds(secondsRemaining) : "Tomato"
        let status = NSMutableAttributedString(attachment: attachment)
        status.append(NSAttributedString(string: " "))
        status.append(NSAttributedString(string: text, attributes: [.font: font]))

        button.image = nil
        button.title = ""
        button.attributedTitle = status
        button.setAccessibilityValue(text)
    }

    private func refreshMenuState() {
        sessionInfoItem.title = sessionTitle(for: timerViewModel.sessionKind)
        startPauseItem.title = timerViewModel.isRunning ? "Pause" : "Start"
        skipBreakItem.isEnabled = !timerViewModel.isWorkSession
    }

    @objc private func handleStartPause() {
        timerViewModel.toggle()
        refreshMenuState()
    }

    @objc private func handleReset() {
        timerViewModel.reset()
        refreshMenuState()
    }

    @objc private func handleSkipBreak() {
        timerViewModel.skipBreak()
        refreshMenuState()
    }

    @objc private func handleQuickStart(_ sender: NSMenuItem) {
        timerViewModel.startQuickTimer(minutes: sender.tag)
        refreshMenuState()
    }

    @objc private func handleOpenMainWindow() {
        mainWindowCoordinator.openOrFocusMainWindow()
    }

    @objc private func handleQuit() {
        NSApp.terminate(nil)
    }

    private func formatSeconds(_ seconds: Int) -> String {
        let minutes = max(seconds, 0) / 60
        let remainder = max(seconds, 0) % 60
        return String(format: "%02d:%02d", minutes, remainder)
    }

    private func sessionTitle(for sessionKind: SessionKind) -> String {
        switch sessionKind {
        case .work:
            return "Work Session"
        case .shortBreak:
            return "Short Break"
        case .longBreak:
            return "Long Break"
        }
    }
}

extension MenuBarStatusItemController: NSMenuDelegate {
    func menuWillOpen(_ menu: NSMenu) {
        refreshMenuState()
    }
}
