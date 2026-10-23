#!/usr/bin/env bash
# Builds the demo clinic the Windows lab resets to: demo patients and records,
# Macedonian, MKD, a clinic profile, and lab machines wired to the lab's
# virtual COM ports and Exigo folder. Output: scripts/windows-lab/.demo-clinic.zip
# (git-ignored; `appctl provision` copies it over).
#
# Uses the Mac dev bridge (scripts/dev-bridge.sh) with a sandbox of its own.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SANDBOX="$ROOT/.dev-bridge-sandbox-demo"
APPDATA="$SANDBOX/home/Library/Application Support/com.vetclinic.app"
OUT_DIR="$ROOT/scripts/windows-lab/.demo-clinic"
OUT_ZIP="$ROOT/scripts/windows-lab/.demo-clinic.zip"
BRIDGE="http://127.0.0.1:1421"
ORIGIN="http://localhost:1420"

call() {
  curl -sf -X POST "$BRIDGE/invoke" -H "origin: $ORIGIN" -H 'content-type: application/json' -d "$1" >/dev/null \
    || { echo "make-demo-clinic: call failed: $1" >&2; exit 1; }
}

lsof -nP -iTCP:1421 -sTCP:LISTEN >/dev/null 2>&1 && { echo "make-demo-clinic: stop the running dev bridge first" >&2; exit 1; }

ARKIVET_SANDBOX="$SANDBOX" ARKIVET_SEED_HOUSEHOLDS="${ARKIVET_SEED_HOUSEHOLDS:-20}" \
  "$ROOT/scripts/dev-bridge.sh" >"$SANDBOX.log" 2>&1 &
launcher=$!
trap 'kill $launcher 2>/dev/null || true' EXIT
until grep -q '\[dev-bridge\] ready' "$SANDBOX.log" 2>/dev/null; do
  kill -0 $launcher 2>/dev/null || { cat "$SANDBOX.log"; exit 1; }
  sleep 2
done

echo "[demo] clinic settings and profile…"
call '{"cmd":"update_app_settings","updates":{"language":"mk","currency_id":1,"date_format":"DD.MM.YYYY","theme":"light"}}'
call '{"cmd":"update_clinic_profile","input":{"name":"Ветеринарна амбуланта Демо","address":"ул. Партизанска 12","city":"Скопје","phone":"02 3100 200","email":"demo@ambulanta.mk","taxNumber":"4030000000000","registrationNumber":"7000000","bankAccount":"300000000000000","bankName":"Демо Банка","pricesIncludeVat":true}}'

echo "[demo] stopping the app…"
kill $launcher 2>/dev/null || true
pkill -f "target/debug/vet-clinic" 2>/dev/null || true
sleep 2

echo "[demo] lab machines on the lab's COM ports and Exigo folder…"
sqlite3 "$APPDATA/vet_clinic.db" <<'SQL'
DELETE FROM device_integrations;
INSERT INTO device_integrations (name, device_type, connection_type, watch_directory, file_pattern, serial_port_name, serial_baud_rate, enabled, created_at, updated_at) VALUES
  ('Exigo (хематологија)', 'exigo_eos_vet', 'file_watch', 'C:\ArkivetLab\exigo', '*.xml', NULL, NULL, 1, datetime('now'), datetime('now')),
  ('PointCare (биохемија)', 'mnchip_pointcare_chemistry', 'serial_port', NULL, NULL, 'COM20', 9600, 1, datetime('now'), datetime('now')),
  ('Healvet', 'healvet_hv_fia_3000', 'serial_port', NULL, NULL, 'COM22', 9600, 1, datetime('now'), datetime('now')),
  ('PCR', 'mnchip_pcr_analyzer', 'serial_port', NULL, NULL, 'COM24', 9600, 1, datetime('now'), datetime('now'));
DELETE FROM device_processed_samples;
PRAGMA wal_checkpoint(TRUNCATE);
SQL

rm -rf "$OUT_DIR" "$OUT_ZIP"
mkdir -p "$OUT_DIR"
# Everything but the logs and backups; the lab keeps its own logs.
(cd "$APPDATA" && tar cf - --exclude logs --exclude backups --exclude session.lock --exclude '*-wal' --exclude '*-shm' .) | (cd "$OUT_DIR" && tar xf -)
(cd "$OUT_DIR" && zip -qr "$OUT_ZIP" .)
echo "[demo] $OUT_ZIP ($(du -h "$OUT_ZIP" | cut -f1))"
