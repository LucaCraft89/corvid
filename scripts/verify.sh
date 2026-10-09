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
# --report FILE    report path. Default: docs/reports/phase-N-<platform>-<date>-run.md (always written;
#                  host info + result table + log tails; paste this one file back).
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
LOGS="$(mktemp)"
trap 'rm -f "$LOGS"' EXIT
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
  { printf '\n### %s (%s)\n\n```\n' "$name" "$res"; tail -n 60 "$logf"; printf '```\n'; } >>"$LOGS"
  rm -f "$logf"
done
mode="real"
[ "${CORVID_FIXTURE:-0}" != 1 ] || mode="fixture (tooling logic only; no real Chromium)"
echo "phase $PHASE / $PLATFORM / $mode: $pass pass, $fail fail, $skip skip"

# Single report file, written by default so it can be pasted back as-is.
if [ -z "$REPORT" ]; then
  mkdir -p "$CORVID_ROOT/docs/reports"
  suffix=""
  [ "${CORVID_FIXTURE:-0}" != 1 ] || suffix="-fixture"
  REPORT="$CORVID_ROOT/docs/reports/phase-$PHASE-$PLATFORM-$(date -u +%F)-run$suffix.md"
fi
{
  printf '# Phase %s verify report (%s)\n\n' "$PHASE" "$PLATFORM"
  printf -- '- Date (UTC): %s\n- Mode: %s\n' "$(date -u +%FT%TZ)" "$mode"
  printf -- '- Repo revision: %s\n' "$(git -C "$CORVID_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  printf -- '- Pinned Chromium: %s\n' "$(pinned_version)"
  printf -- '- Host: %s; cores: %s; RAM: %s; free disk at CORVID_SRC parent: %s\n' "$(uname -srm)" \
    "$(nproc 2>/dev/null || echo ?)" "$(awk '/MemTotal/ {printf "%.0f GB", $2/1048576}' /proc/meminfo 2>/dev/null || echo ?)" \
    "$(d="$(dirname "$CORVID_SRC")"; while [ ! -d "$d" ] && [ "$d" != / ]; do d="$(dirname "$d")"; done; df -h --output=avail "$d" 2>/dev/null | tail -n1 | tr -d ' ')"
  printf -- '- Tools: %s\n\n' "$(for t in python3 git shellcheck sccache gn autoninja; do printf '%s=%s ' "$t" "$(command -v "$t" >/dev/null 2>&1 && echo yes || echo no)"; done)"
  printf '| Check | Result | Evidence (last lines) |\n|---|---|---|\n'
  printf '%s\n' "${rows[@]}"
  printf '\nTotals: %s pass, %s fail, %s skip.\n' "$pass" "$fail" "$skip"
  printf '\n## Log tails\n'
  cat "$LOGS"
} >"$REPORT"
echo "report written: $REPORT"
[ "$fail" -eq 0 ] || exit 1
[ "$skip" -eq 0 ] || exit 3
exit 0
