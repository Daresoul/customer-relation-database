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
- Search, quick search and the household list skip merged-away households
  (`households.merged_into_id IS NOT NULL`).

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
  patient can be hard-deleted. It sits in the banner's More menu.
- A patient that died or left is marked, not deleted: `mark_patient_deceased`
  (date, not after today, and an optional note) or `mark_patient_inactive`
  (optional reason). Both set `is_active = 0` and keep the chart;
  `deceased_at` tells the two apart. `reactivate_patient` clears both, and is
  refused when the chip now belongs to another active patient.
- Inactive and deceased patients are left out of `search_patients` (unless
  `includeInactive`), the lab-result chip match, the appointment picker and
  the patient table (its "Show inactive" switch brings them back, greyed).
  `get_patients` still returns everyone. Household pets come with `status`
  (`active`, `inactive`, `deceased`) and show greyed when not active.
- A deceased patient can't be booked (`PATIENT_DECEASED`). Marking one
  deceased lists its future appointments, ticked; the ticked ones are
  cancelled through `update_appointment`, so Google Calendar follows.
- The patient page opens with a banner: name, species, breed, sex with
  neuter status (`neutered`: true, false or NULL for not recorded), age (days
  under a week, weeks under 8 weeks, then months, then years; frozen at the
  date of death), last weight with its date and a trend line, the owner with
  a copyable phone, and alert chips.
- Alerts (`patient_alerts`) are typed: `allergy`, `aggressive`, `chronic`,
  `other`, each with a note of at most 200 characters. Allergy and aggressive
  show red. The patient table shows them next to the name.
- Weights are a log (`patient_weights`: weight, `measured_on`, optional
  `medical_record_id`). `patients.weight` always holds the newest entry (by
  date, then by entry), for older readers; adding or removing an entry keeps
  it in step. Creating a patient with a weight, or setting the weight field,
  also logs it for today. A weight typed in a new medical record is logged
  against that record. Migration `054_patient_weight_log` moved each
  existing weight into the log, dated at the patient's `updated_at`.
- `update_household`: a field left out (`None`) is kept; an empty string clears
  address, city, postal code or notes to NULL. The name can't be cleared.
- Duplicate warning: every household create form (dashboard, Add patient, lab
  import, patient page) shows `DuplicateHouseholdWarning` while typing. It
  calls `find_household_duplicates` (`queries/household_duplicates.rs`):
  same phone (digits only, +389 read as 0), same email (any case), or same
  person name in Latin or Cyrillic (names are compared transliterated; FTS
  finds the candidates). It never blocks: the submit button becomes "Create
  anyway". At most 5 matches, best first; merged-away households never match.
- Merge (`merge_households`, `queries/household_merge.rs`): one transaction
  moves people, contacts and pet links into the kept household. A person
  with the same name folds into the kept person; a phone or email the kept
  household already has is dropped; the kept household keeps one primary
  person. Name and address come from whichever household the user picks.
  The merged-away row stays with `merged_into_id` set: lists and search hide
  it, its search row is removed, and opening its id
  (`get_household_with_people`, the household page) shows the kept
  household. Each merge is logged in `household_merges`. There is no undo.
- Moving a pet (`update_patient_household`): one transaction; a pet has one
  household. A missing pet or household changes nothing. "Link existing pet"
  on the household page uses the same command.
- Deleting a household is refused (`HOUSEHOLD_HAS_PETS`) while pets belong
  to it; the page offers Merge instead. Households merged into it go too.
- One primary person per household: `set_primary_person` ("Make primary")
  clears the others in a transaction; `update_person` with `isPrimary: true`
  does the same and ignores `false`. Deleting the primary person makes the
  longest-standing other person primary; the last person can't be deleted.

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

## App shell and navigation
- The app uses a data router: `createBrowserRouter(appRoutes)` in `App.tsx`,
  routes in `src/layouts/routes.tsx`. Every page renders inside
  `layouts/RootLayout`: the header, the device bar, the lab import modal, the
  chip-scan and wake-from-tray handlers, and the crash boundary. Code that
  needs the router (`useNavigate`, `useBlocker`) goes inside it. Tests render
  pages with `createMemoryRouter` + `RouterProvider`.
- `useUnsavedChangesGuard(dirty)` holds every in-app navigation (header,
  links, Back, breadcrumbs) behind "Discard / Keep editing" while `dirty`, and
  asks the browser before a reload. Its returned `confirmLeave(fn)` covers
  non-navigation exits such as closing a form. The record page and record
  modal use it.
- Header (`components/AppHeader`): app name (home), patient search, backup
  light, Settings (always shown). Slots for other features:
  `AppShellHeader` props `labInboxSlot` (lab inbox badge) and
  `deviceStatusSlot`.
- Patient search opens with Ctrl/Cmd+K, `/` (not while typing in a field) or
  the header button. It calls `global_patient_search`: pet name or chip
  (Unicode-aware), and every pet of an owner found by name or phone through the
  household index (dashes and spaces ignored). Arrows move, Enter opens.
  Before typing it lists the last 8 opened patients (localStorage
  `arkivet.recentPatients`, this computer only).
- A chip scan on any page (keyboard wedge, HID event, wake from tray) opens the
  one patient with that chip, opens the search when several have it, and offers
  "Create patient" (dashboard form, chip filled in) when none has it. It is
  ignored while a text field has focus, while the lab import is open, or over
  another dialog. The dashboard no longer handles scans itself.
- Backup light: red when the last backup attempt failed, amber when no folder
  is set, no backup ran yet, or the last one is 26 hours old or more, green
  otherwise. Click opens `/settings?section=backups` (any section key works).
- Dashboard "Today" strip (replaces the all-time counters): today's
  appointments (click opens the patient), lab results waiting (today the
  Saved-for-later count; the strip takes it as `waitingLabCount`), and patients
  seen today (`count_patients_seen`: patients with a record created in the
  local day).
- The household list has no Status or Last activity columns: the list query
  has no real last-visit date.

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
  Every 2 minutes, files changed in the last 15 minutes are read again
  (`rescan_recent`), so a lost folder event delays a result instead of losing
  it; samples already offered are skipped.
- An Exigo per-day file is split per `<sample>`; each sample is offered once,
  keyed by `SNO:SEQ` in `device_processed_samples`. A file is read only after
  its size and time stayed the same for 1 s. On start, results that arrived
  in the last 72 h while the app was closed are offered. The first time a
  folder is watched, what is already in it is recorded, not offered.

### Lab inbox (`services/lab_inbox.rs`, page `/lab-inbox`, dashboard tab)
- Every result row in `file_access_history` (one per result or Exigo sample)
  has `inbox_state`: `waiting`, `attached` or `discarded` (migration
  `055_lab_inbox`). A new result and a failed read start as `waiting`.
  "Save for later" and its typed serial are gone; `pending_device_entries`
  keeps its rows but nothing writes it. On upgrade, results already attached
  became `attached`, saved-for-later ones `waiting`, and all other older
  results `discarded` with reason `before_inbox` (Restore brings one back).
- The inbox lists each result with the machine, the machine's patient ID, the
  match (chip, name guess, several, none), and the values with unit, range
  and H/L flag (Exigo: the machine's `_L`/`_H` range and the PDF's units;
  HL7: the machine's unit, range and flag). A result waiting over 24 h is
  highlighted. Actions: Attach… (opens the import), Discard with a reason
  (`qc`, `test`, `duplicate`, `other`, optional note), Restore, and Move.
  The badge component `components/LabInbox/LabInboxBadge` shows the
  waiting count (`get_lab_inbox_count`).
- Attaching marks the row `attached` with `attached_record_id`; the lab
  attachment stores the result's `source_file_id`. The import can add a
  result to an existing record of the picked patient (today's record is
  preselected) instead of making a new one; the record page's Recent files
  Add does the same. Either way the attachment is a `test_result` with its
  device type, and the record's lab report is rebuilt from all its lab
  results (`regenerate_pdf_from_medical_record`, which retires the old one).
- Move to another patient (record page lab row, or an attached inbox row):
  the attachment and the old record's lab report are soft-deleted, a copy is
  attached to the chosen record, both lab reports are rebuilt, and the move
  is logged in `lab_result_moves` (from/to attachment and record, `moved_at`,
  `moved_by` = the computer's login name). A failed rebuild keeps the move
  and says so.
- Deleting a lab attachment on the record page puts its result back in
  `waiting`.

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
- Invoice totals are worked out in one place, `services/money.rs`, in integer
  cents: each line is price × quantity; lines are grouped by VAT rate; the
  discount comes off each group, rounded half-up once; the group is then split
  into net and VAT, half-up. The record form and page ask the backend
  (`calculate_invoice_totals`) and the invoice PDF prints the same numbers.
- VAT: Settings › Clinic holds the rates (seeded "ДДВ 18%", "ДДВ 5%", "0%",
  none the default) and whether prices are entered with VAT included (the
  default) or without. A price-list item has a default rate; a record line
  keeps the rate's id, name and percent as they were when it was saved
  (`tax_rate_id`, `vat_name`, `vat_percent`). A line sent without
  `taxRateId` takes its price-list item's default; `null` means no rate.
  Lines saved before VAT have no rate: they count as 0%, the invoice shows no
  VAT section, and the total is exactly what it was.
- Clinic profile (Settings › Clinic, table `clinic_profile`): name, address,
  city, phone, email, ЕДБ, ЕМБС, bank account, bank and a logo (PNG/JPG up to
  2 MB, copied to `<app data>/clinic/`). It is printed over the templates'
  letterhead on reports, pharmacy notes, invoices and lab reports; a part is
  redrawn only when the profile fills it, and a blank field keeps the
  template's text. The template's own text stays under the cover in the
  PDF's text layer.
- Rust → Java job JSON (additive): every job may carry `clinic` {`name`,
  `address`, `city`, `phone`, `email`, `tax_number`, `registration_number`,
  `bank_account`, `bank_name`, `logo_path`}, null where blank; a job without
  it gets the profile last loaded by the app (`JavaPdfService::set_letterhead`).
  An invoice line may carry `vat_label` and `vat_percent`, and an invoice
  `totals` {`subtotal`, `discount_amount`, `total`, `vat_total`,
  `prices_include_vat`, `vat_groups`: [{`label`, `percent`, `net`, `vat`,
  `gross`}]}; Java prints these instead of computing its own.
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
