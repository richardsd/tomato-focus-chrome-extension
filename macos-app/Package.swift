// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TomatoFocusMacApp",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "TomatoFocusMacApp", targets: ["TomatoFocusMacApp"])
    ],
    targets: [
        .target(name: "CoreInterfaces"),
        .target(name: "CoreDI", dependencies: ["CoreInterfaces"]),
        .target(name: "PlatformServices", dependencies: ["CoreInterfaces"]),
        .target(name: "JiraIntegration", dependencies: ["CoreInterfaces"]),
        .target(name: "TimerFeature", dependencies: ["CoreInterfaces"]),
        .target(name: "TasksFeature", dependencies: ["CoreInterfaces"]),
        .target(name: "StatisticsFeature", dependencies: ["CoreInterfaces"]),
        .target(name: "SettingsFeature", dependencies: ["CoreInterfaces"]),
        .target(
            name: "AppShell",
            dependencies: [
                "CoreDI",
                "CoreInterfaces",
                "TimerFeature",
                "TasksFeature",
                "StatisticsFeature",
                "SettingsFeature"
            ]
        ),
        .executableTarget(
            name: "TomatoFocusMacApp",
            dependencies: [
                "AppShell",
                "CoreDI",
                "CoreInterfaces",
                "PlatformServices",
                "JiraIntegration",
                "TimerFeature",
                "TasksFeature",
                "StatisticsFeature",
                "SettingsFeature"
            ]
        )
    ]
)
