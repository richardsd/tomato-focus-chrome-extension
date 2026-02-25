import SwiftUI

public enum DSColor {
    public static let focus = Color(red: 0.14, green: 0.62, blue: 0.34)
    public static let shortBreak = Color(red: 0.20, green: 0.58, blue: 0.84)
    public static let longBreak = Color(red: 0.53, green: 0.41, blue: 0.84)
    public static let warning = Color(red: 0.94, green: 0.61, blue: 0.17)

    public static let pageBackground = Color(nsColor: .windowBackgroundColor)
    public static let cardBackground = Color(nsColor: .controlBackgroundColor)
    public static let tertiaryBackground = Color(nsColor: .underPageBackgroundColor)
    public static let secondaryText = Color.secondary
}

public enum DSSpacing {
    public static let xxs: CGFloat = 4
    public static let xs: CGFloat = 8
    public static let sm: CGFloat = 12
    public static let md: CGFloat = 16
    public static let lg: CGFloat = 20
    public static let xl: CGFloat = 28
    public static let xxl: CGFloat = 36
}

public enum DSTypography {
    public static let title = Font.system(size: 30, weight: .bold, design: .rounded)
    public static let subtitle = Font.system(size: 18, weight: .semibold, design: .rounded)
    public static let body = Font.system(size: 14, weight: .regular, design: .default)
    public static let metric = Font.system(size: 58, weight: .bold, design: .rounded)
}

public enum DSRadius {
    public static let small: CGFloat = 10
    public static let medium: CGFloat = 14
    public static let large: CGFloat = 20
}

public struct DSCardModifier: ViewModifier {
    private let padded: Bool

    public init(padded: Bool = true) {
        self.padded = padded
    }

    public func body(content: Content) -> some View {
        content
            .padding(padded ? DSSpacing.md : 0)
            .background(
                RoundedRectangle(cornerRadius: DSRadius.medium, style: .continuous)
                    .fill(.regularMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: DSRadius.medium, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: 4)
    }
}

public extension View {
    func dsCard(padded: Bool = true) -> some View {
        modifier(DSCardModifier(padded: padded))
    }
}

public struct DSPrimaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .fontWeight(.semibold)
            .padding(.horizontal, DSSpacing.md)
            .padding(.vertical, DSSpacing.xs)
            .background(DSColor.focus.opacity(configuration.isPressed ? 0.82 : 1))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: DSRadius.small, style: .continuous))
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

public struct DSSecondaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .fontWeight(.medium)
            .padding(.horizontal, DSSpacing.md)
            .padding(.vertical, DSSpacing.xs)
            .background(Color.primary.opacity(configuration.isPressed ? 0.10 : 0.06))
            .foregroundStyle(.primary)
            .clipShape(RoundedRectangle(cornerRadius: DSRadius.small, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: DSRadius.small, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            )
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

public struct DSDestructiveButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .fontWeight(.medium)
            .padding(.horizontal, DSSpacing.md)
            .padding(.vertical, DSSpacing.xs)
            .background(Color.red.opacity(configuration.isPressed ? 0.18 : 0.12))
            .foregroundStyle(Color.red)
            .clipShape(RoundedRectangle(cornerRadius: DSRadius.small, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: DSRadius.small, style: .continuous)
                    .strokeBorder(Color.red.opacity(0.16), lineWidth: 1)
            )
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

public struct DSChipStyle: ButtonStyle {
    private let isSelected: Bool
    private let tint: Color

    public init(isSelected: Bool, tint: Color = DSColor.focus) {
        self.isSelected = isSelected
        self.tint = tint
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.caption.weight(.medium))
            .padding(.horizontal, DSSpacing.sm)
            .padding(.vertical, DSSpacing.xs)
            .background(
                Capsule(style: .continuous)
                    .fill(isSelected ? tint.opacity(configuration.isPressed ? 0.22 : 0.16) : Color.primary.opacity(0.06))
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(isSelected ? tint.opacity(0.42) : Color.primary.opacity(0.08), lineWidth: 1)
            )
            .foregroundStyle(isSelected ? tint : Color.primary)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

public struct DSTimerRing: View {
    public let progress: Double
    public let tint: Color
    public var lineWidth: CGFloat

    public init(progress: Double, tint: Color, lineWidth: CGFloat = 14) {
        self.progress = progress
        self.tint = tint
        self.lineWidth = lineWidth
    }

    public var body: some View {
        ZStack {
            Circle()
                .stroke(Color.primary.opacity(0.10), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))

            Circle()
                .trim(from: 0, to: max(0, min(progress, 1)))
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

public struct DSMetricCard: View {
    private let title: String
    private let value: String
    private let symbol: String
    private let tint: Color

    public init(title: String, value: String, symbol: String, tint: Color = DSColor.focus) {
        self.title = title
        self.value = value
        self.symbol = symbol
        self.tint = tint
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: DSSpacing.xs) {
            Label(title, systemImage: symbol)
                .font(.caption)
                .foregroundStyle(DSColor.secondaryText)
            Text(value)
                .font(.title2.weight(.bold))
                .foregroundStyle(tint)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dsCard()
    }
}
