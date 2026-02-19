# macOS Release Checklist

This checklist documents the release gates for the macOS build and maps each gate to an automated pipeline step in `.github/workflows/macos-release-pipeline.yml`.

## Roles

- **Release Manager**: owns release execution and approvals.
- **macOS Engineer**: owns native app packaging, entitlements, signing, and notarization.
- **Platform Engineer**: owns CI/CD workflow, distribution channel routing, and rollback mechanics.
- **Observability Owner**: owns crash/error telemetry quality.

## Checklist

| Task | Owner | Automation | Verification steps | Rollback plan |
| --- | --- | --- | --- | --- |
| Apple code signing and notarization | macOS Engineer | `tools/macos-release.sh sign <app-path>` and `tools/macos-release.sh notarize <app-path>` (run by `macOS Release Pipeline`) | 1) Confirm `codesign --verify --deep --strict --verbose=2` succeeds. 2) Confirm `xcrun notarytool submit --wait` returns success. 3) Confirm `xcrun stapler staple` succeeds and app launches on a clean macOS account. | Revoke the problematic notarized artifact from distribution, fix signing identity/entitlements, rebuild and notarize a replacement build, then republish. |
| Entitlements review for notifications/network/background behavior | macOS Engineer | `tools/macos-release.sh entitlements macos-app/Config/TomatoFocus.entitlements` | 1) Verify required keys are present (`app-sandbox`, `network.client`, `notifications`). 2) Validate runtime behavior: notifications deliver, Jira network calls succeed, and background timer recovery behaves as expected after sleep/wake. | If a capability fails or over-privileged key is discovered, remove/adjust entitlement keys, rebuild, and rerun the entitlements gate before re-release. |
| Scenario parity gate | Release Manager + QA Lead | `tools/macos-release.sh parity-gate docs/parity-test-matrix.md docs/parity-exceptions.md` | 1) Ensure every `GA-critical = Yes` row in parity matrix is `Parity Achieved`. 2) For any non-achieved row, ensure status is `Documented Exception` and a matching entry exists in `docs/parity-exceptions.md`. 3) Attach evidence links for each updated row. | Block GA release candidate, complete missing parity validations or create approved documented exceptions with ticket/owner/milestone. |
| Crash/error logging integration | Observability Owner | `tools/macos-release.sh crash-logging` with `SENTRY_DSN` and `SENTRY_ENVIRONMENT` | 1) Ensure pipeline gate passes with production DSN configured. 2) Trigger a controlled non-fatal error in staging and verify event arrival with release/version tags. 3) Confirm alert routing for release regressions. | Disable rollout for the affected channel, restore last-known-good DSN/config, and ship a patch build with corrected telemetry initialization. |
| Versioned storage migrations | Platform Engineer | `tools/macos-release.sh migrations` | 1) Gate verifies JS export schema version is compatible with Swift importer ceiling. 2) Run import/export smoke test with previous-version sample data and ensure no data loss. 3) Verify changelog includes migration notes for schema-affecting changes. | Block release, bump/patch migration logic, and restore compatibility with prior schema before resuming rollout. |
| Update channel strategy (App Store or direct distribution) | Release Manager + Platform Engineer | `tools/macos-release.sh update-channel <app-store\|direct>` | 1) For **App Store**: confirm TestFlight build availability and phased rollout plan. 2) For **Direct**: confirm `SPARKLE_APPCAST_URL` is configured, update feed is signed, and staged cohort rollout is defined. 3) Confirm selected channel in workflow dispatch input matches release notes. | Pause rollout channel (App Store phased release pause or direct feed pin), repoint users to prior stable build, and publish corrected metadata/feed. |

## Release execution order

1. Run `macOS Release Pipeline` workflow with the target `update_channel`.
2. Ensure all **preflight** checks are green.
3. Run signing/notarization by setting `run_sign_and_notarize=true` when artifact is ready.
4. Approve channel rollout only after verification evidence is attached to the release ticket.

## Evidence required in release ticket

- Workflow run URL for successful preflight and (if applicable) sign/notarize jobs.
- Screenshot or exported logs proving notification/network/background entitlement behavior.
- Crash telemetry event link for the release version.
- Migration compatibility output from the preflight step.
- Parity gate output plus links to `docs/parity-test-matrix.md` row evidence and any entries in `docs/parity-exceptions.md`.
- Channel rollout plan and rollback owner acknowledgment.
