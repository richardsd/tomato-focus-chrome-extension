// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TomatoFocusMacApp",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(name: "DesignSystem", targets: ["DesignSystem"]),
        .library(name: "CoreInterfaces", targets: ["CoreInterfaces"]),
        .library(name: "CoreDI", targets: ["CoreDI"]),
        .library(name: "PlatformServices", targets: ["PlatformServices"]),
        .library(name: "JiraIntegration", targets: ["JiraIntegration"]),
        .library(name: "TimerFeature", targets: ["TimerFeature"]),
        .library(name: "TasksFeature", targets: ["TasksFeature"]),
        .library(name: "StatisticsFeature", targets: ["StatisticsFeature"]),
        .library(name: "SettingsFeature", targets: ["SettingsFeature"]),
        .library(name: "AppShell", targets: ["AppShell"]),
        .executable(name: "TomatoFocus", targets: ["TomatoFocus"])
    ],
    targets: [
        .target(name: "DesignSystem"),
        .target(name: "CoreInterfaces"),
        .target(name: "CoreDI", dependencies: ["CoreInterfaces"]),
        .target(
            name: "PlatformServices",
            dependencies: ["CoreInterfaces"],
            resources: [.process("Resources")]
        ),
        .target(name: "JiraIntegration", dependencies: ["CoreInterfaces"]),
        .target(name: "TimerFeature", dependencies: ["CoreInterfaces", "DesignSystem"]),
        .target(name: "TasksFeature", dependencies: ["CoreInterfaces", "DesignSystem"]),
        .target(name: "StatisticsFeature", dependencies: ["CoreInterfaces", "DesignSystem"]),
        .target(name: "SettingsFeature", dependencies: ["CoreInterfaces", "DesignSystem"]),
        .target(
            name: "AppShell",
            dependencies: [
                "DesignSystem",
                "CoreDI",
                "CoreInterfaces",
                "TimerFeature",
                "TasksFeature",
                "StatisticsFeature",
                "SettingsFeature"
            ]
        ),
        .executableTarget(
            name: "TomatoFocus",
            dependencies: [
                "AppShell",
                "DesignSystem",
                "CoreDI",
                "CoreInterfaces",
                "PlatformServices",
                "JiraIntegration",
                "TimerFeature",
                "TasksFeature",
                "StatisticsFeature",
                "SettingsFeature"
            ],
            path: "Sources/TomatoFocusMacApp"
        )
    ]
)
