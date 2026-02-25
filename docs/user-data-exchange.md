# User data exchange (Extension → macOS)

Tomato Focus uses a versioned JSON envelope for transferring local user data from the Chrome extension into the macOS app.

## Schema

- **Schema ID:** `com.tomatofocus.user-data`
- **Current schema version:** `1`
- JSON Schema definition: `docs/user-data-exchange-schema-v1.json`

## Conflict policy

`sourceFileReplacesLocal`

When importing into macOS, all local data is replaced with the imported payload:

- settings
- tasks
- current task selection
- statistics history
- timer state

This is implemented in `UserDefaultsStorageService.importExtensionUserData(_:)`.

## Versioning and migration

- macOS currently supports **schema version 1**.
- If an import has no `schemaVersion` but looks like legacy extension state (`settings`, `tasks`, or `statistics` at root), the importer migrates it into a v1 envelope before validation.
- If schema version is newer than supported, import fails with a user-facing message.

## Validation and errors

The macOS importer validates:

- envelope identity (`schemaId`)
- compatible version
- conflict policy value
- data shape and required sections
- task titles and duplicate IDs
- current task pointer consistency

Validation/import failures are surfaced in Settings as red, user-facing errors.
