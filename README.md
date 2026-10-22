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
- `create_patient_with_household` follows the same rules as patient create.

## Patients and households
- Deleting a patient is refused (`PATIENT_HAS_HISTORY`) while it has medical
  records or appointments, because those would cascade away. Only an empty
  patient can be hard-deleted.
- `update_household`: a field left out (`None`) is kept; an empty string clears
  address, city, postal code or notes to NULL. The name can't be cleared.

## Frontend states and caching
- A failed load shows `components/common/LoadError` (message plus Retry that
  refetches), never an empty list or zero counters.
- Saves report success only after the backend confirms (`mutateAsync`), with one
  message; a failed save keeps the form filled.
- After a patient or household write, call `invalidatePatientData` or
  `invalidateHouseholdData` (`hooks/invalidation.ts`). The file lists which
  cache keys show that data.
- Routed pages sit inside `RouteErrorBoundary`; a crash shows a translated
  screen with Reload and Go to dashboard, and leaving the page clears it.

## Google Calendar
- When Google refuses the stored login (refresh rejected or a 401), the app
  sets `google_calendar_settings.needs_reauth` (migration 048). Settings then
  shows "Reconnect", and the background sync stops until the user reconnects.
- `last_sync_error` keeps the last sync failure until a sync succeeds; Settings
  shows it with the last-synced time.
- Events and the created calendar use this computer's time zone
  (`services::google_calendar::local_time_zone`, fallback Europe/Skopje).

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

## Medical records and invoices
- A record, its line items and its history row are saved in one transaction
  (`MedicalRecordService::save_new_record` / `save_record_changes`). An edit
  sends cleared values explicitly: `lineItems: []`, `discountPercent: null`,
  `manualTotal: null`. A missing field means "unchanged". A manual total only
  applies to a record without line items.
- Every create and edit regenerates the medical report, the pharmacy note (if
  there is a prescription) and the invoice (if there are line items). A new
  document replaces the old one of its kind only after it is stored; the old
  one is soft-deleted. A document the record no longer has content for is
  retired. Create and update return the record plus `pdfs: [{kind, ok,
  error}]`; the frontend warns about a failed one, and Retry calls
  `regenerate_record_document` (`report`, `pharmacy_note`, `invoice`) or, for a
  lab report, `regenerate_pdf_from_medical_record`.
- The invoice number and date are assigned once, on the first invoice, in
  local time (`assign_invoice`; columns `invoice_number`, `invoice_date`). Later
  edits reprint the same number and date. The number's year is the local year.
- A long invoice continues on another letterhead page with the column headings
  repeated; long item names wrap.
- An edit waits for the record's diagnoses to load before it can be saved, and
  the record modal and page ask before discarding typed text.
- Number inputs read "," or "." as the decimal mark (`src/utils/localeNumber.ts`):
  "4,5" is 4.5 and "1.500,50" is 1500.5. A single mark is decimal in weights
  and doses ("1.500" is 1.5). Price fields (`localeMoneyParser`) read one mark
  followed by exactly three digits as thousands, so "1.500" ден is 1500.

## Deleted attachments
- Deleting an attachment is a soft delete: `deleted_at` is set and every read
  filters `deleted_at IS NULL`. Two things delete one: the app, when it
  replaces a regenerated document (`simple_report`, `pharmacy_note`,
  `invoice`, `generated_pdf`), and the user, with the record page's Delete
  button ("Delete this file? The file will be removed from this record.") on
  a `file` or `test_result`.
- 30 days after `deleted_at`, `services/attachment_purge.rs` removes the file
  from `<app data>/files/medical` and sets `purged_at`. The row stays for the
  record's history. Until then a mistaken delete is undone by clearing
  `deleted_at`; after it the file is gone. It runs at start and daily in the
  background and logs files removed, bytes freed, already-missing and skipped.
- It only removes a plain file named by `file_id` directly inside the
  attachment folder. A `file_id` with a path separator, `..` or an absolute
  path, a directory, a symlink, an unreadable `deleted_at`, or a file still
  listed in `file_access_history` is skipped. A file already gone is marked
  purged. A missing attachment folder stops the run.
- Backups mirror files additively, so a purged file stays in earlier backups.

## Translations
- English (`en`) and Macedonian (`mk`) texts live in
  `src/i18n/locales/<lang>/<namespace>.json`. Every key exists in both
  languages with the same `{{placeholders}}`.
- `src/i18n/__tests__/keys.test.ts` fails when the two languages have
  different keys, or when a literal key in a `t()` call is missing or names a
  group instead of a text. An unprefixed key resolves in the first namespace
  given to `useTranslation`; files that get `t` as a parameter name their
  namespace in the test's `FILE_NAMESPACE` map.
- Mutation error titles take an operation key from `errors:operations`
  (`createMutationErrorHandler(notification, 'createAppointment', t)` shows
  "Неуспешно креирање на термин").
- The calendar follows the app language, and weeks start on Monday.

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
