#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
macos-release.sh - Release automation helpers for Tomato Focus macOS builds.

Usage:
  tools/macos-release.sh entitlements <entitlements.plist>
  tools/macos-release.sh migrations
  tools/macos-release.sh parity-gate [parity-matrix.md] [parity-exceptions.md]
  tools/macos-release.sh crash-logging
  tools/macos-release.sh update-channel <app-store|direct>
  tools/macos-release.sh sign <app-path>
  tools/macos-release.sh notarize <app-path>
  tools/macos-release.sh package-dmg <app-path> [output-dir]

Required environment variables (depending on subcommand):
  APPLE_TEAM_ID
  APPLE_SIGNING_IDENTITY      (for sign)
  APPLE_ID                    (for notarize)
  APPLE_APP_PASSWORD          (for notarize)
USAGE
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

check_entitlements() {
  local entitlements_path="$1"
  [[ -f "$entitlements_path" ]] || {
    echo "Entitlements file not found: $entitlements_path" >&2
    exit 1
  }

  require_command plutil

  local required_keys=(
    "com.apple.security.network.client"
    "com.apple.security.notifications"
  )

  echo "Reviewing entitlements in $entitlements_path"
  for key in "${required_keys[@]}"; do
    if ! plutil -extract "$key" raw "$entitlements_path" >/dev/null 2>&1; then
      echo "Missing expected entitlement key: $key" >&2
      exit 1
    fi
  done

  if plutil -extract "com.apple.security.app-sandbox" raw "$entitlements_path" >/dev/null 2>&1; then
    echo "Sandbox entitlement is present."
  else
    echo "Warning: app sandbox entitlement not found." >&2
  fi

  echo "Entitlements preflight check passed."
}

check_migrations() {
  local js_version
  local swift_version

  js_version="$(node --input-type=module -e "import { USER_DATA_SCHEMA_VERSION } from './src/core/userDataExchange.js'; console.log(USER_DATA_SCHEMA_VERSION)")"
  swift_version="$(sed -n '1,220p' macos-app/Sources/CoreInterfaces/UserDataExchange.swift | awk '/guard schemaVersion <=/{print $4; exit}' | tr -d ' ')"

  if [[ -z "$swift_version" ]]; then
    echo "Could not determine Swift schema compatibility ceiling." >&2
    exit 1
  fi

  echo "JavaScript export schema version: $js_version"
  echo "Swift import compatibility ceiling: $swift_version"

  if (( js_version > swift_version )); then
    echo "Swift importer does not yet support the JS export schema version." >&2
    exit 1
  fi

  echo "Schema/migration compatibility check passed."
}

normalize_markdown_cell() {
  local value="$1"
  value="$(echo "$value" | sed -E 's/\*\*//g; s/`//g' | xargs)"
  echo "$value"
}

check_parity_gate() {
  local matrix_path="${1:-docs/parity-test-matrix.md}"
  local exceptions_path="${2:-docs/parity-exceptions.md}"
  local rows_file
  local exception_ids_file
  local failures=0

  [[ -f "$matrix_path" ]] || {
    echo "Parity matrix not found: $matrix_path" >&2
    exit 1
  }

  rows_file="$(mktemp)"
  exception_ids_file="$(mktemp)"
  trap 'rm -f "$rows_file" "$exception_ids_file"' RETURN

  while IFS='|' read -r _ id _ _ _ _ ga_critical parity_status _; do
    id="$(normalize_markdown_cell "$id")"
    [[ "$id" =~ ^[A-Z][A-Z0-9]*[0-9]+$ ]] || continue
    ga_critical="$(normalize_markdown_cell "$ga_critical")"
    parity_status="$(normalize_markdown_cell "$parity_status")"
    echo "$id|$ga_critical|$parity_status" >> "$rows_file"
  done < <(grep -E '^\|' "$matrix_path")

  if [[ ! -s "$rows_file" ]]; then
    echo "No scenario rows parsed from parity matrix: $matrix_path" >&2
    exit 1
  fi

  if [[ -f "$exceptions_path" ]]; then
    while IFS='|' read -r _ id _ _ _ _ _; do
      id="$(normalize_markdown_cell "$id")"
      [[ "$id" =~ ^[A-Z][A-Z0-9]*[0-9]+$ ]] || continue
      echo "$id" >> "$exception_ids_file"
    done < <(grep -E '^\|' "$exceptions_path")
  fi

  while IFS='|' read -r id ga_critical parity_status; do
    if [[ "$ga_critical" == "Yes" && "$parity_status" != "Parity Achieved" ]]; then
      echo "GA-critical parity gate failed for $id: status is '$parity_status' (must be 'Parity Achieved')." >&2
      failures=$((failures + 1))
    fi

    if [[ "$parity_status" != "Parity Achieved" ]]; then
      if [[ "$parity_status" != "Documented Exception" ]]; then
        echo "Parity status for $id is '$parity_status'. Allowed values for unreconciled rows: 'Documented Exception'." >&2
        failures=$((failures + 1))
      elif ! grep -Fxq "$id" "$exception_ids_file"; then
        echo "Documented exception missing for $id in $exceptions_path." >&2
        failures=$((failures + 1))
      fi
    fi
  done < "$rows_file"

  if (( failures > 0 )); then
    echo "Parity gate failed with $failures issue(s)." >&2
    exit 1
  fi

  echo "Parity gate passed: all GA-critical rows are Parity Achieved, and all open gaps are documented exceptions."
}

check_crash_logging() {
  if [[ -z "${SENTRY_DSN:-}" ]]; then
    echo "SENTRY_DSN is not configured. Crash/error logging release gate failed." >&2
    exit 1
  fi

  if [[ -z "${SENTRY_ENVIRONMENT:-}" ]]; then
    echo "SENTRY_ENVIRONMENT is not configured. Crash/error logging release gate failed." >&2
    exit 1
  fi

  echo "Crash/error logging configuration check passed."
}

check_update_channel() {
  local channel="$1"
  case "$channel" in
    app-store)
      echo "App Store channel selected. Ensure App Store Connect metadata and TestFlight rollout are configured."
      ;;
    direct)
      if [[ -z "${SPARKLE_APPCAST_URL:-}" ]]; then
        echo "SPARKLE_APPCAST_URL must be set for direct distribution updates." >&2
        exit 1
      fi
      echo "Direct channel selected with Sparkle appcast URL: $SPARKLE_APPCAST_URL"
      ;;
    *)
      echo "Unknown update channel: $channel" >&2
      exit 1
      ;;
  esac
}

sign_app() {
  local app_path="$1"
  [[ -d "$app_path" ]] || {
    echo "App bundle not found: $app_path" >&2
    exit 1
  }

  require_env APPLE_TEAM_ID
  require_env APPLE_SIGNING_IDENTITY
  require_command codesign

  codesign --force --deep --options runtime --timestamp \
    --entitlements "${MACOS_ENTITLEMENTS_PATH:-macos-app/Config/TomatoFocus.entitlements}" \
    --sign "$APPLE_SIGNING_IDENTITY" \
    "$app_path"

  codesign --verify --deep --strict --verbose=2 "$app_path"
  echo "Code signing completed successfully."
}

notarize_app() {
  local app_path="$1"
  [[ -d "$app_path" ]] || {
    echo "App bundle not found: $app_path" >&2
    exit 1
  }

  require_env APPLE_TEAM_ID
  require_env APPLE_ID
  require_env APPLE_APP_PASSWORD
  require_command xcrun

  local zip_path
  zip_path="${app_path%/}.zip"
  /usr/bin/ditto -c -k --keepParent "$app_path" "$zip_path"

  xcrun notarytool submit "$zip_path" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_APP_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait

  xcrun stapler staple "$app_path"
  echo "Notarization + stapling completed successfully."
}

package_dmg() {
  local app_path="$1"
  local output_dir="${2:-dist}"
  [[ -d "$app_path" ]] || {
    echo "App bundle not found: $app_path" >&2
    exit 1
  }

  require_command hdiutil

  local app_name
  app_name="$(basename "$app_path" .app)"
  local version
  version="${MACOS_APP_VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")}"
  local dmg_path="${output_dir}/${app_name}-${version}.dmg"
  local volume_name="${MACOS_DMG_VOLUME_NAME:-$app_name}"
  local staging_dir
  staging_dir="$(mktemp -d)"

  mkdir -p "$output_dir"
  cp -R "$app_path" "$staging_dir/"
  ln -s /Applications "$staging_dir/Applications"

  hdiutil create -volname "$volume_name" -srcfolder "$staging_dir" -ov -format UDZO "$dmg_path"
  rm -rf "$staging_dir"

  echo "DMG created at: $dmg_path"
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

subcommand="$1"
shift

case "$subcommand" in
  entitlements)
    [[ $# -eq 1 ]] || { usage; exit 1; }
    check_entitlements "$1"
    ;;
  migrations)
    check_migrations
    ;;
  parity-gate)
    [[ $# -le 2 ]] || { usage; exit 1; }
    check_parity_gate "$@"
    ;;
  crash-logging)
    check_crash_logging
    ;;
  update-channel)
    [[ $# -eq 1 ]] || { usage; exit 1; }
    check_update_channel "$1"
    ;;
  sign)
    [[ $# -eq 1 ]] || { usage; exit 1; }
    sign_app "$1"
    ;;
  notarize)
    [[ $# -eq 1 ]] || { usage; exit 1; }
    notarize_app "$1"
    ;;
  package-dmg)
    [[ $# -ge 1 && $# -le 2 ]] || { usage; exit 1; }
    package_dmg "$@"
    ;;
  *)
    usage
    exit 1
    ;;
esac
