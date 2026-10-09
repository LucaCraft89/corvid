#!/usr/bin/env bash
# Extra check for task 0.3: refresh-patches.sh is a no-op on an untouched tree, picks up an edit
# to an existing patch, and creates + registers a new patch. Fixture mode only.
set -euo pipefail
# shellcheck source=tests/acceptance/phase-0/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
[ "$FIXTURE" = 1 ] || skip "refresh round-trip is exercised on the fixture tree only"
setup

# Drop the conflicting-on-v2 patch; not needed here but harmless. Apply v1 series.
"$RROOT/scripts/apply-patches.sh" >/dev/null 2>&1
before="$(cd "$RROOT/patches" && find . -type f | sort | xargs sha256sum | sha256sum)"
"$RROOT/scripts/refresh-patches.sh" >"$WORK/r1.log" 2>&1 || { cat "$WORK/r1.log"; fail "refresh failed"; }
after="$(cd "$RROOT/patches" && find . -type f | sort | xargs sha256sum | sha256sum)"
[ "$before" = "$after" ] || { cat "$WORK/r1.log"; fail "refresh changed patches on an untouched tree"; }
say "no-op refresh OK"

# New patch via a corvid-new commit.
echo "new line" >>"$CORVID_SRC/foo.cc"
fx_git add foo.cc
fx_git commit -q -m "corvid-new: ui/foo-extra" -m "Purpose: extra foo line
Area: ui
Files: foo.cc
Rebase risk: low because trivial
Origin: original"
"$RROOT/scripts/refresh-patches.sh" >"$WORK/r2.log" 2>&1 || { cat "$WORK/r2.log"; fail "refresh with new commit failed"; }
cat "$WORK/r2.log"
[ -f "$RROOT/patches/ui/0004-foo-extra.patch" ] || fail "new patch file not created"
tail -n 1 "$RROOT/patches/series" | grep -qx 'ui/0004-foo-extra.patch' || fail "new patch not appended to series"
"$RROOT/scripts/lint-patches.sh" || fail "lint rejects refreshed series"
# The regenerated series must apply from scratch to the same tree content.
h1="$(sha256sum "$CORVID_SRC/foo.cc" | cut -d' ' -f1)"
"$RROOT/scripts/apply-patches.sh" >"$WORK/r3.log" 2>&1 || { cat "$WORK/r3.log"; fail "re-apply after refresh failed"; }
h2="$(sha256sum "$CORVID_SRC/foo.cc" | cut -d' ' -f1)"
[ "$h1" = "$h2" ] || fail "re-apply after refresh differs"
say "PASS: refresh round-trip (no-op, new patch registered, re-apply identical)"
