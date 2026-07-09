import Foundation
import XCTest

final class SmokeTests: XCTestCase {
    func testProjectLoads() {
        XCTAssertTrue(true)
    }

    func testNavigationShellSmokeAssertions() throws {
        let source = try loadSourceFile(at: "macos-app/Sources/AppShell/AppShell.swift")
        XCTAssertTrue(source.contains("NavigationSplitView"))
        XCTAssertTrue(source.contains("enum AppSection"))
        XCTAssertFalse(source.contains("case settings"))
        XCTAssertFalse(source.contains("Quick Actions"))
        XCTAssertTrue(source.contains("ToolbarItemGroup(placement: .primaryAction)"))
        XCTAssertFalse(source.contains("DSPrimaryButtonStyle()"))
    }

    func testNativeSettingsSceneSmokeAssertions() throws {
        let source = try loadSourceFile(at: "macos-app/Sources/TomatoFocusMacApp/TomatoFocusApp.swift")
        XCTAssertTrue(source.contains("WindowGroup(\"Tomato Focus\", id: mainWindowID)"))
        XCTAssertTrue(source.contains("Settings {"))
        XCTAssertTrue(source.contains("SettingsView(viewModel: settingsViewModel)"))
    }

    func testTasksListDetailSmokeAssertions() throws {
        let source = try loadSourceFile(at: "macos-app/Sources/TasksFeature/TasksFeature.swift")
        XCTAssertTrue(source.contains("List(selection: $selectedTaskID)"))
        XCTAssertTrue(source.contains("saveDraft() -> UUID?"))
        XCTAssertTrue(source.contains("canSetCurrent"))
    }

    func testTimerControlSmokeAssertions() throws {
        let source = try loadSourceFile(at: "macos-app/Sources/TimerFeature/TimerFeature.swift")
        XCTAssertTrue(source.contains("DSTimerRing"))
        XCTAssertTrue(source.contains("Quick Start"))
        XCTAssertTrue(source.contains("viewModel.toggle()"))
        XCTAssertTrue(source.contains("viewModel.startQuickTimer"))
    }

    private func loadSourceFile(at relativePath: String) throws -> String {
        let rootURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let fileURL = rootURL.appendingPathComponent(relativePath)
        return try String(contentsOf: fileURL, encoding: .utf8)
    }
}
