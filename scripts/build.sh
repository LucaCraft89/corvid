#!/usr/bin/env bash
# One command from nothing to a launched, rebranded Chromium on Linux.
#
# Usage: scripts/build.sh linux [debug|release] [--no-fetch] [--no-apply] [--no-smoke]
#
# Steps: fetch.sh (pinned tag) -> apply-patches.sh -> gn gen -> autoninja chrome -> smoke test
# (chrome --version must contain the branded name; headless launch must dump a DOM).
#
# Env: CORVID_SRC, DEPOT_TOOLS (default ~/depot_tools), CORVID_JOBS (autoninja -j; lower it if RAM is short).
# UNVERIFIED: never run in the authoring sandbox (needs a real Chromium checkout and build host).
set -euo pipefail
# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLATFORM="${1:-}"
CONFIG="${2:-debug}"
shift $(( $# > 2 ? 2 : $# )) || true
FETCH=1 APPLY=1 SMOKE=1
for a in "$@"; do
  case "$a" in
    --no-fetch) FETCH=0 ;;
    --no-apply) APPLY=0 ;;
    --no-smoke) SMOKE=0 ;;
    *) die "unknown argument: $a" ;;
  esac
done
[ "$PLATFORM" = linux ] || die "only 'linux' is implemented in Phase 0 (got '${PLATFORM:-none}')"
case "$CONFIG" in debug) OUT=Debug ;; release) OUT=Release ;; *) die "config must be debug|release" ;; esac

DEPOT_TOOLS="${DEPOT_TOOLS:-$HOME/depot_tools}"
export PATH="$DEPOT_TOOLS:$PATH"

[ "$FETCH" = 0 ] || "$CORVID_ROOT/scripts/fetch.sh"
[ "$APPLY" = 0 ] || "$CORVID_ROOT/scripts/apply-patches.sh"

cd "$CORVID_SRC"
ARGS=(
  "is_debug=$([ "$OUT" = Debug ] && echo true || echo false)"
  "is_component_build=$([ "$OUT" = Debug ] && echo true || echo false)"
  "symbol_level=$([ "$OUT" = Debug ] && echo 1 || echo 0)"
  "blink_symbol_level=0"
  "is_official_build=false"
  "chrome_pgo_phase=0"
)
if command -v sccache >/dev/null 2>&1; then
  ARGS+=("cc_wrapper=\"sccache\"")
else
  log "sccache not found; building without compile cache"
fi
gn gen "out/$OUT" --args="${ARGS[*]}"
JOBS=()
[ -z "${CORVID_JOBS:-}" ] || JOBS=(-j "$CORVID_JOBS")
autoninja "${JOBS[@]}" -C "out/$OUT" chrome

[ "$SMOKE" = 1 ] || exit 0
NAME="$(python3 -I "$CORVID_ROOT/scripts/render-branding.py" --get name)"
VERSION_OUT="$("out/$OUT/chrome" --version)"
log "chrome --version: $VERSION_OUT"
case "$VERSION_OUT" in
  *"$NAME"*) ;;
  *) die "version string does not contain branded name '$NAME'" ;;
esac
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT
DOM="$(timeout 120 "out/$OUT/chrome" --headless=new --disable-gpu --no-sandbox \
  --user-data-dir="$PROFILE" --dump-dom about:blank)"
case "$DOM" in *"<html"*) log "headless launch OK" ;; *) die "headless launch produced no DOM" ;; esac
