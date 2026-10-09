#!/usr/bin/env bash
# Phase acceptance runner.
#
# Usage:
#   scripts/verify.sh --phase N --platform linux [--fixture] [--report FILE]
#   scripts/verify.sh --patch-check
#
# --phase N        run tests/acceptance/phase-N/*.sh. Exit 0 from a test = PASS, 77 = SKIP, else FAIL.
# --fixture        set CORVID_FIXTURE=1: tests run against a tiny fake repo instead of real Chromium.
#                  Fixture runs prove the tooling logic only; they NEVER prove a real build.
# --report FILE    also write a markdown result table.
# --patch-check    PR gate: lint patches/, then apply the series to the tree at CORVID_SRC.
#
# Exit: 0 all pass; 1 any fail; 3 no fail but some skipped (incomplete: do not mark a phase done).
set -euo pipefail
# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PHASE="" PLATFORM="linux" REPORT="" PATCH_CHECK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --phase) PHASE="$2"; shift ;;
    --platform) PLATFORM="$2"; shift ;;
    --report) REPORT="$2"; shift ;;
    --fixture) export CORVID_FIXTURE=1 ;;
    --patch-check) PATCH_CHECK=1 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

if [ "$PATCH_CHECK" = 1 ]; then
  "$CORVID_ROOT/scripts/lint-patches.sh"
  "$CORVID_ROOT/scripts/apply-patches.sh"
  exit 0
fi

[ -n "$PHASE" ] || die "usage: verify.sh --phase N --platform linux [--fixture] | --patch-check"
DIR="$CORVID_ROOT/tests/acceptance/phase-$PHASE"
[ -d "$DIR" ] || die "no acceptance tests at $DIR"
export CORVID_PLATFORM="$PLATFORM"

pass=0 fail=0 skip=0
rows=()
for t in "$DIR"/*.sh; do
  name="$(basename "$t")"
  logf="$(mktemp)"
  set +e
  bash "$t" >"$logf" 2>&1
  rc=$?
  set -e
  case "$rc" in
    0) res=PASS; pass=$((pass + 1)) ;;
    77) res=SKIP; skip=$((skip + 1)) ;;
    *) res="FAIL($rc)"; fail=$((fail + 1)) ;;
  esac
  last="$(tail -n 3 "$logf" | tr '\n' ' ' | cut -c1-200)"
  printf '%-28s %-9s %s\n' "$name" "$res" "$last"
  rows+=("| \`$name\` | $res | ${last//|/\\|} |")
  if [ "$res" != PASS ] && [ "$res" != SKIP ]; then sed 's/^/    /' "$logf"; fi
  rm -f "$logf"
done
mode="real"
[ "${CORVID_FIXTURE:-0}" != 1 ] || mode="fixture (tooling logic only; no real Chromium)"
echo "phase $PHASE / $PLATFORM / $mode: $pass pass, $fail fail, $skip skip"

if [ -n "$REPORT" ]; then
  {
    printf '| Check | Result | Evidence (last lines) |\n|---|---|---|\n'
    printf '%s\n' "${rows[@]}"
    printf '\nMode: %s. Totals: %s pass, %s fail, %s skip.\n' "$mode" "$pass" "$fail" "$skip"
  } >"$REPORT"
fi
[ "$fail" -eq 0 ] || exit 1
[ "$skip" -eq 0 ] || exit 3
exit 0
