#!/usr/bin/env bash
# Shared helpers. Exit codes: 0 PASS, 1 FAIL, 77 UNVERIFIED (needs a built Corvid and/or network/hardware).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
unverified() { echo "UNVERIFIED: $*"; exit 77; }
need_browser() {
  [[ -n "${CORVID_BIN:-}" && -x "${CORVID_BIN}" ]] || unverified "set CORVID_BIN to a built Corvid binary (no Chromium build in this environment)"
  command -v curl >/dev/null || unverified "curl missing"
}
# Launches a clean, throwaway profile with remote debugging; sets PROFILE, PORT, BPID.
launch() {
  PROFILE="$(mktemp -d)"; PORT="${PORT:-9333}"
  "$CORVID_BIN" --user-data-dir="$PROFILE" --remote-debugging-port="$PORT" --corvid-dev --no-first-run "$@" >"$PROFILE/stdout.log" 2>&1 &
  BPID=$!
  for _ in $(seq 1 50); do curl -fs "http://127.0.0.1:$PORT/json/version" >/dev/null && return 0; sleep 0.2; done
  echo "browser did not start"; kill "$BPID" 2>/dev/null; exit 1
}
cleanup() { [[ -n "${BPID:-}" ]] && kill "$BPID" 2>/dev/null; [[ -n "${PROFILE:-}" ]] && rm -rf "$PROFILE"; }
trap cleanup EXIT
