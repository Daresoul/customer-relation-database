# customer-relation-database

## Database migrations (`src-tauri/src/database/migrations.rs`)
- Append new migrations to the list in `run_migrations`. Never change what an
  already-shipped migration does; clinic databases have run it.
- A migration that rebuilds a table (CREATE new, copy, DROP old, RENAME) goes
  through `rebuild_with_foreign_keys_off`. Every pooled connection has foreign
  keys on, so a plain `DROP TABLE` cascade-deletes the child rows. The helper
  checks `PRAGMA foreign_key_check` before committing. Recreate the table's
  triggers and indexes inside the rebuild.
- Never `.ok()` a statement that fills or moves data; let the migration fail.
- Raw SQL in `src-tauri/src` is prepared against the migrated schema by
  `tests/sql_schema_check.rs`. Keep its allow-list empty.

## Household search
- `household_search` (FTS5) is kept fresh by the triggers from migration 046,
  on insert, update and delete of households, people and person_contacts.
  Their row SQL is `household_search::index_rows_sql`; changing it needs a new
  migration that recreates the triggers.
- Search terms are quoted per word, so dashes, quotes and FTS5 keywords are
  plain text. A phone typed with dashes matches one stored with spaces or none.

## Microchips
- Create and update store the chip without spaces or dashes, and a 12-hex
  FDX-B read as its 15-digit number (`services::patient::normalize_microchip`).
- A chip already on another active patient is refused in code. There is no
  UNIQUE index, because clinic databases may already hold duplicates.
- The lab-result resolver reports two or more active chip matches as ambiguous
  and picks none.

## Lab devices (read-only)
- The app only reads from analyzers. It never writes to a serial port.
- Serial read loop (`services/device_input.rs`): any read error other than a
  timeout closes the port and reconnects with backoff (Windows unplug codes 22,
  31, 1167 and 995 included). The backoff starts over after a connection that
  stayed up for 30 s.
- Every result goes through `services/device_events.rs`: the copy is saved
  (`file_access_history`, status `ok`) before `device-data-received` is sent,
  and the payload carries `fileId` (that row's `file_id`). Bytes that don't
  parse, empty results, cut-off frames and failed saves are kept as a `failed`
  row and sent as a `device-event` (`kind`, `messageKey`, `deviceName`,
  `fileId`), which the frontend shows as a toast.
- Statuses carry `error_kind` (plain-language text in `devices:health.kinds`),
  `last_result_at` (also stored in `device_integrations.last_result_at`) and,
  for serial, `last_byte_at`.
- Folder watchers (`services/file_watcher.rs`) follow the settings: they
  restart after any device integration change or Reconnect, a missing folder
  is checked every 30 s, and a folder that disappears turns the status red.
- An Exigo per-day file is split per `<sample>`; each sample is offered once,
  keyed by `SNO:SEQ` in `device_processed_samples`. A file is read only after
  its size and time stayed the same for 1 s. On start, results that arrived
  in the last 72 h while the app was closed are offered. The first time a
  folder is watched, what is already in it is recorded, not offered.

## Release build secrets

The release workflow (`.github/workflows/release.yml`) reads these GitHub
Actions secrets:

- `TAURI_PRIVATE_KEY`, `TAURI_KEY_PASSWORD` — updater signing key.
- `ARKIVET_LOKI_URL`, `ARKIVET_LOKI_USER`, `ARKIVET_LOKI_PASSWORD` — Loki log
  shipping. They are baked into the binary at build time
  (`src-tauri/src/services/loki_shipper.rs`). The same names set as runtime
  environment variables override the baked values. If any one is missing,
  log shipping stays off and the app logs one line saying so. Use a push-only
  Loki user: anyone with the binary can extract it.

Failed Tauri commands are reported to the log (and so to Loki) with the
command name, error message and duration only, never their arguments
(`src/services/invoke.ts`).

## Webview security

`src-tauri/tauri.conf.json` sets a strict CSP (scripts only from the app,
inline styles allowed for antd), turns off `withGlobalTauri`, and narrows the
allowlist to what the frontend uses. Detect Tauri with `src/utils/isTauri.ts`,
not `window.__TAURI__`. The e2e-fullstack build turns the global back on with
`TAURI_CONFIG='{"build":{"withGlobalTauri":true}}'` (see
`.github/workflows/e2e-windows.yml`), because its specs drive the app through it.
