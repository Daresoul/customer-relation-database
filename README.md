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
  "4,5" is 4.5 and "1.500,50" is 1500.5. A single mark is always decimal, so
  "1.500" is 1.5; type "1500" for one thousand five hundred.

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
