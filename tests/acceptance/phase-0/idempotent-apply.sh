#!/usr/bin/env bash
# Acceptance 2: applying the series twice leaves the same tree, no .rej/.orig.
set -euo pipefail
# shellcheck source=tests/acceptance/phase-0/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
setup

"$RROOT/scripts/apply-patches.sh" >"$WORK/run1.log" 2>&1 || { cat "$WORK/run1.log"; fail "first apply failed"; }
s1="$(tree_state)"
"$RROOT/scripts/apply-patches.sh" >"$WORK/run2.log" 2>&1 || { cat "$WORK/run2.log"; fail "second apply failed"; }
s2="$(tree_state)"
cat "$WORK/run2.log"

[ "$s1" = "$s2" ] || fail "tree state differs between first and second apply ($s1 vs $s2)"
# Untracked and not gitignored only: upstream dependency dirs ship their own *.orig files.
strays="$(git -C "$CORVID_SRC" ls-files -o --exclude-standard | { grep -E '\.(rej|orig)$' || true; })"
[ -z "$strays" ] || fail "stray files: $strays"

if [ "$FIXTURE" = 1 ]; then
  # Non-vacuous: the patches and overlay really are in the tree.
  grep -q 'foo line 6 PATCHED' "$CORVID_SRC/foo.cc" || fail "patch 1 content missing"
  grep -q 'baz line 10 PATCHED' "$CORVID_SRC/baz.cc" || fail "patch 3 content missing"
  [ -f "$CORVID_SRC/extra/overlay.txt" ] || fail "overlay file missing"
  grep -q '^PRODUCT_FULLNAME=Corvid$' "$CORVID_SRC/chrome/app/theme/chromium/BRANDING" || fail "branding not rendered"
  # A stale untracked file from a previous state must be removed by the reset.
  echo junk >"$CORVID_SRC/stale.txt"
  "$RROOT/scripts/apply-patches.sh" >/dev/null 2>&1
  [ ! -e "$CORVID_SRC/stale.txt" ] || fail "reset did not remove stale untracked file"
  [ "$(tree_state)" = "$s1" ] || fail "state differs after third apply with stale file"
fi
say "PASS: idempotent (state $s1), no .rej/.orig"
