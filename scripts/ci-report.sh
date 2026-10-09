#!/usr/bin/env bash
# One pasteable markdown report: portable checks (run now) + the overlay C++ build/test results (read from
# reports/overlay/ if scripts/overlay-tests.sh ran on this checkout, otherwise stated as NOT RUN).
#
# Usage: scripts/ci-report.sh [--portable-only] [--out FILE]      (default: print to stdout and reports/ci-report.md)
# Legend: PASS = ran, real result. FAIL = ran and failed. SKIP = prerequisite missing (not a pass).
#         UNVERIFIED = written but never compiled/run against Chromium. Exit 1 if any portable check FAILs.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 1
only_portable=0; out="$root/reports/ci-report.md"
while [ $# -gt 0 ]; do
  case "$1" in --portable-only) only_portable=1 ;; --out) out="$2"; shift ;; *) echo "unknown arg $1" >&2; exit 1 ;; esac
  shift
done
mkdir -p "$(dirname "$out")"
fails=0
rows=""; details=""
run() { # name, command...
  local name="$1"; shift
  local log; log="$(mktemp)"
  "$@" >"$log" 2>&1; local rc=$?
  local status=PASS
  [ $rc -eq 77 ] && status=SKIP
  [ $rc -ne 0 ] && [ $rc -ne 77 ] && { status=FAIL; fails=$((fails+1)); }
  rows+="| $name | $status | $(tail -n 1 "$log" | tr '|' '/' | cut -c1-110) |"$'\n'
  if [ "$status" != PASS ]; then details+="### $name ($status)"$'\n''```'$'\n'"$(tail -n 25 "$log")"$'\n''```'$'\n'; fi
  rm -f "$log"
}

run "tsc --noEmit" npm run -s typecheck
run "ui lint" npm run -s lint
run "module manifests" npm run -s validate:manifests
run "npm licenses" npm run -s licenses
run "node tests" bash -c 'npm test 2>&1 | grep -E "^# (tests|pass|fail)" | tr "\n" " "; test "${PIPESTATUS[0]}" -eq 0'
run "stock-pages table up to date" node ui/tools/gen-stock-pages.mjs --check
run "overlay C++ logic on stand-ins (NOT Chromium)" scripts/overlay-selfcheck.sh
run "phase 1 acceptance scripts (expect all SKIP without a browser)" bash -c 'tests/acceptance/phase-1/run.sh --allow-skip | tail -n 1'
if command -v shellcheck >/dev/null 2>&1; then run "shellcheck scripts" shellcheck -S warning -x scripts/overlay-tests.sh scripts/overlay-selfcheck.sh scripts/ci-report.sh scripts/pin-ubo.sh; fi

ubo="$(python3 - <<'PY'
import tomllib
d = tomllib.load(open("extensions/preinstalled.toml", "rb"))["extension"][0]
sha = d.get("sha256", "")
print("pinned" if len(sha) == 64 and all(c in "0123456789abcdef" for c in sha) else "NOT PINNED (run scripts/pin-ubo.sh with network access)")
PY
)"

{
  echo "# Corvid CI report"
  echo
  echo "- Corvid: $(git rev-parse --short HEAD 2>/dev/null || echo unknown) on $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown); generated $(date -u +%FT%TZ)"
  echo "- Chromium pin: $(grep -Ev '^[[:space:]]*(#|$)' scripts/CHROMIUM_VERSION | head -n1)"
  echo "- uBlock Origin pin: $ubo"
  echo
  echo "## Portable checks (no Chromium needed)"
  echo
  echo '| check | result | last line |'; echo '|---|---|---|'
  printf '%s' "$rows"
  echo
  if [ -n "$details" ]; then echo "$details"; fi
  echo "## Overlay C++ against real Chromium (scripts/overlay-tests.sh)"
  echo
  if [ "$only_portable" = 1 ]; then
    echo "Not part of this run (--portable-only). All of src-overlay/corvid is UNVERIFIED until the corvid-builder job runs."
  elif [ -f reports/overlay/summary.md ]; then
    cat reports/overlay/summary.md
  else
    echo "NOT RUN on this checkout (no reports/overlay/summary.md): the builder was unavailable or skipped. All of src-overlay/corvid is UNVERIFIED."
  fi
} | tee "$out"
[ "$fails" -eq 0 ]
