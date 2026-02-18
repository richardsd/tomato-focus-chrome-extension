# macOS CI workflow (`.github/workflows/macos-build.yml`)

This repository includes a reusable macOS build pipeline for Xcode or Swift Package Manager projects.

## What the workflow does

- Triggers on:
  - `push` to `main`, `develop`, `release/**`, and `hotfix/**`
  - `pull_request` targeting those same branches
  - `workflow_dispatch` (manual run, optional notarization)
  - version tags like `v*`
- Uses `macos-latest` with a pinned Xcode version (`16.0`) via `maxim-lobanov/setup-xcode`.
- Auto-detects build type:
  - `.xcworkspace`
  - `.xcodeproj`
  - `Package.swift` (SPM, including nested packages such as `macos-app/Package.swift`)
- Runs:
  - dependency resolution
  - clean build
  - test execution (scheme or SwiftPM tests)
- Packages and uploads build outputs as a GitHub Actions artifact.
- For SwiftPM macOS builds, also creates and uploads an app bundle artifact at `dist/macos/Tomato Focus.app`.
- Supports an optional sign + notarize job for tags and manual dispatches.

## Optional repository variables

Set these as **Actions variables** when auto-detection needs to be overridden:

- `XCODE_WORKSPACE` – path to workspace (for example: `apps/MyApp.xcworkspace`)
- `XCODE_PROJECT` – path to project (for example: `apps/MyApp.xcodeproj`)
- `XCODE_SCHEME` – scheme used for build/archive
- `XCODE_TEST_SCHEME` – test scheme (defaults to `XCODE_SCHEME`)
- `XCODE_DESTINATION` – build destination (default `platform=macOS`)
- `XCODE_TEST_DESTINATION` – test destination (default `platform=macOS`)

For this repository, the committed macOS project is `macos-app/TomatoFocusMacApp.xcodeproj` and the preferred scheme is `TomatoFocusMacAppApp`.

## Secrets for signing and notarization (required only for release/notarization)

The `sign-and-notarize` job is only executed for tag pushes or when manually triggered with `notarize=true`.

Create these repository secrets before enabling notarization:

- `APPLE_TEAM_ID` – Apple Developer Team ID (for signing and notarization)
- `APPLE_CERTIFICATE_P12_BASE64` – base64-encoded signing certificate (`.p12`)
- `APPLE_CERTIFICATE_PASSWORD` – password used to export the `.p12`
- `APPLE_PROVISIONING_PROFILE_BASE64` – base64-encoded provisioning profile (`.mobileprovision`)
- `APPLE_KEYCHAIN_PASSWORD` – temporary keychain password used in CI
- `APPLE_SIGNING_IDENTITY` – codesign identity string (for example `Developer ID Application: Company, Inc. (TEAMID)`)
- `APPLE_NOTARY_KEY_ID` – App Store Connect API key ID
- `APPLE_NOTARY_ISSUER_ID` – App Store Connect API issuer UUID
- `APPLE_NOTARY_API_PRIVATE_KEY_BASE64` – base64-encoded App Store Connect `.p8` key
- `APPLE_NOTARY_KEYCHAIN_PROFILE` – keychain profile alias used by `notarytool store-credentials`

## Secret formatting examples

```bash
# macOS / Linux: encode signing certificate
base64 -i certificate.p12 | pbcopy

# macOS / Linux: encode provisioning profile
base64 -i profile.mobileprovision | pbcopy

# macOS / Linux: encode App Store Connect API key
base64 -i AuthKey_ABC123XYZ.p8 | pbcopy
```

> If your shell wraps base64 output, keep it as a single-line secret value in GitHub.

## Branch protection / required checks guidance

Once the workflow is green and stable:

1. Open **Settings → Branches → Branch protection rules**.
2. Edit the protection rule for `main` (and any protected release branch patterns).
3. Enable **Require status checks to pass before merging**.
4. Add required check: **`macOS build/test`**.
5. (Recommended) Also require **up-to-date branches** before merge.

This ensures macOS compilation and tests pass before PRs can be merged.
