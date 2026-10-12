#!/usr/bin/env bash
# Acceptance 1: on a fresh machine, ONE command fetches, applies, builds chrome (Linux debug)
# and launches it headless, printing a version string containing the branded name.
# Real Chromium only. Fixture mode cannot test this, so it skips (never passes).
set -euo pipefail
# shellcheck source=tests/acceptance/phase-0/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

[ "$FIXTURE" != 1 ] || skip "clean-build needs real Chromium; not testable in fixture mode"
[ "${CORVID_ALLOW_BUILD:-0}" = 1 ] || skip "set CORVID_ALLOW_BUILD=1 on a real build host (150 GB disk, 32 GB RAM); UNVERIFIED"

NAME="$(python3 -I "$T_ROOT/scripts/render-branding.py" --get name)"
# CORVID_REUSE_BUILD=1: only check the existing out/Debug/chrome. build.sh resets and re-patches the tree, which
# recompiles thousands of files (~15 h on 4 cores); run the full proof once, at the end of a milestone.
if [ "${CORVID_REUSE_BUILD:-0}" = 1 ] && [ -x "${CORVID_SRC:-$HOME/chromium/src}/out/Debug/chrome" ]; then
  say "CORVID_REUSE_BUILD=1: skipping build.sh, checking the existing binary only (not a clean-build proof)"
else
  out="$("$T_ROOT/scripts/build.sh" linux debug 2>&1)" || { printf '%s\n' "$out" | tail -n 40; fail "build.sh failed"; }
  printf '%s\n' "$out" | tail -n 5
fi
VERSION_LINE="$("${CORVID_SRC:-$HOME/chromium/src}/out/Debug/chrome" --version)"
say "chrome --version: $VERSION_LINE"
case "$VERSION_LINE" in *"$NAME"*) say "PASS: version string contains '$NAME'" ;; *) fail "version string lacks '$NAME'" ;; esac
