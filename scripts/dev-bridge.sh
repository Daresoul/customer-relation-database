#!/usr/bin/env bash
# Runs the real app (debug build) with the dev bridge, so a plain browser
# (Playwright) can drive it at http://localhost:1420/?bridge=1.
#
# The app gets a throwaway HOME, so its database, files and logs live in the
# sandbox folder and never touch your real app data. Lab machines: use the
# simulator commands (send_test_healvet, …) through the bridge.
#
#   scripts/dev-bridge.sh            fresh sandbox, seeded with demo data
#   scripts/dev-bridge.sh --keep     reuse the sandbox from the last run
#   ARKIVET_SEED_HOUSEHOLDS=50 scripts/dev-bridge.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX="${ARKIVET_SANDBOX:-$ROOT/.dev-bridge-sandbox}"
HOUSEHOLDS="${ARKIVET_SEED_HOUSEHOLDS:-40}"
BRIDGE="http://127.0.0.1:1421"
ORIGIN="http://localhost:1420"
KEEP=0
[[ "${1:-}" == "--keep" ]] && KEEP=1

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

bridge_call() {
  curl -sf -X POST "$BRIDGE/invoke" -H "origin: $ORIGIN" -H 'content-type: application/json' -d "$1"
}

if [[ $KEEP -eq 0 ]]; then
  rm -rf "$SANDBOX"
fi
mkdir -p "$SANDBOX/home"

# The Rust build needs the PDF jar and a dist folder at compile time.
if ! ls "$ROOT"/src-tauri/resources/pdf-generator*.jar >/dev/null 2>&1; then
  (cd "$ROOT/pdf-generator-cli" && ./gradlew build -q)
  mkdir -p "$ROOT/src-tauri/resources"
  cp "$ROOT"/pdf-generator-cli/build/libs/pdf-generator-cli-*.jar "$ROOT/src-tauri/resources/"
fi
mkdir -p "$ROOT/dist"
[[ -f "$ROOT/dist/index.html" ]] || echo '<html></html>' > "$ROOT/dist/index.html"

echo "[dev-bridge] building the debug app…"
# Without the custom protocol the window loads the Vite dev server (as
# `tauri dev` does), so it can park on public/bridge-host.html.
(cd "$ROOT/src-tauri" && cargo build -q --no-default-features)

if ! curl -sf "$ORIGIN" >/dev/null 2>&1; then
  echo "[dev-bridge] starting Vite on ${ORIGIN}…"
  (cd "$ROOT" && npm run dev >"$SANDBOX/vite.log" 2>&1) &
  pids+=($!)
  until curl -sf "$ORIGIN" >/dev/null 2>&1; do sleep 0.5; done
fi

echo "[dev-bridge] starting the app with sandbox HOME=${SANDBOX}/home…"
HOME="$SANDBOX/home" \
  ARKIVET_DEV_BRIDGE=1 \
  ARKIVET_HID_CAPTURE=0 \
  ARKIVET_RAW_INPUT=0 \
  "$ROOT/src-tauri/target/debug/vet-clinic" --hidden >"$SANDBOX/app.log" 2>&1 &
pids+=($!)

for _ in $(seq 1 120); do
  bridge_call '{"cmd":"get_app_settings"}' >/dev/null 2>&1 && break
  sleep 0.5
done
bridge_call '{"cmd":"get_app_settings"}' >/dev/null || { echo "[dev-bridge] bridge did not come up; see $SANDBOX/app.log"; exit 1; }

if [[ $KEEP -eq 0 ]]; then
  echo "[dev-bridge] seeding ${HOUSEHOLDS} demo households…"
  bridge_call "{\"cmd\":\"populate_database\",\"households\":$HOUSEHOLDS,\"seed\":42}" >/dev/null
fi

echo "[dev-bridge] ready: open $ORIGIN/?bridge=1   (app log: $SANDBOX/app.log)"
wait
