#!/usr/bin/env bash
set -euo pipefail

PACKAGE_PATH="${PACKAGE_PATH:-macos-app}"
PRODUCT_NAME="${PRODUCT_NAME:-TomatoFocus}"
APP_DISPLAY_NAME="${APP_DISPLAY_NAME:-TomatoFocus}"
APP_EXECUTABLE_NAME="${APP_EXECUTABLE_NAME:-TomatoFocus}"
APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.tomatofocus.mac}"
SWIFT_CONFIGURATION="${SWIFT_CONFIGURATION:-release}"
OUTPUT_DIR="${OUTPUT_DIR:-dist/macos}"
INFO_TEMPLATE_PATH="${INFO_TEMPLATE_PATH:-$PACKAGE_PATH/Config/Info.plist}"
RESOURCE_SOUND_PATH="${RESOURCE_SOUND_PATH:-$PACKAGE_PATH/Sources/PlatformServices/Resources/notification.mp3}"

if [[ ! -f "$PACKAGE_PATH/Package.swift" ]]; then
  echo "Package.swift not found at $PACKAGE_PATH" >&2
  exit 1
fi

if [[ ! -f "$INFO_TEMPLATE_PATH" ]]; then
  echo "Info.plist template not found: $INFO_TEMPLATE_PATH" >&2
  exit 1
fi

if ! command -v swift >/dev/null 2>&1; then
  echo "swift is required but not found in PATH" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but not found in PATH" >&2
  exit 1
fi

APP_VERSION="${APP_VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || echo 1.0.0)}"
APP_BUILD_NUMBER="${APP_BUILD_NUMBER:-$APP_VERSION}"

echo "Building Swift package product '$PRODUCT_NAME' ($SWIFT_CONFIGURATION)"
swift build --package-path "$PACKAGE_PATH" --configuration "$SWIFT_CONFIGURATION" --product "$PRODUCT_NAME"

BINARY_PATH="$(find "$PACKAGE_PATH/.build" -type f -path "*/$SWIFT_CONFIGURATION/$PRODUCT_NAME" -print -quit)"
if [[ -z "$BINARY_PATH" ]]; then
  echo "Could not locate built binary for $PRODUCT_NAME under $PACKAGE_PATH/.build" >&2
  exit 1
fi

APP_PATH="$OUTPUT_DIR/$APP_DISPLAY_NAME.app"
CONTENTS_PATH="$APP_PATH/Contents"
MACOS_PATH="$CONTENTS_PATH/MacOS"
RESOURCES_PATH="$CONTENTS_PATH/Resources"

rm -rf "$APP_PATH"
mkdir -p "$MACOS_PATH" "$RESOURCES_PATH"

cp "$BINARY_PATH" "$MACOS_PATH/$APP_EXECUTABLE_NAME"
chmod +x "$MACOS_PATH/$APP_EXECUTABLE_NAME"

if [[ -f "$RESOURCE_SOUND_PATH" ]]; then
  cp "$RESOURCE_SOUND_PATH" "$RESOURCES_PATH/notification.mp3"
fi

sed \
  -e "s|\${APP_DISPLAY_NAME}|$APP_DISPLAY_NAME|g" \
  -e "s|\${APP_EXECUTABLE_NAME}|$APP_EXECUTABLE_NAME|g" \
  -e "s|\${APP_BUNDLE_ID}|$APP_BUNDLE_ID|g" \
  -e "s|\${APP_VERSION}|$APP_VERSION|g" \
  -e "s|\${APP_BUILD_NUMBER}|$APP_BUILD_NUMBER|g" \
  -e "s|\$(PRODUCT_NAME)|$APP_DISPLAY_NAME|g" \
  -e "s|\$(EXECUTABLE_NAME)|$APP_EXECUTABLE_NAME|g" \
  -e "s|\$(PRODUCT_BUNDLE_IDENTIFIER)|$APP_BUNDLE_ID|g" \
  -e "s|\$(MARKETING_VERSION)|$APP_VERSION|g" \
  -e "s|\$(CURRENT_PROJECT_VERSION)|$APP_BUILD_NUMBER|g" \
  "$INFO_TEMPLATE_PATH" >"$CONTENTS_PATH/Info.plist"

echo "APPL????" >"$CONTENTS_PATH/PkgInfo"
echo "Built app bundle at: $APP_PATH"
