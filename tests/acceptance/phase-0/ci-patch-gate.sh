#!/usr/bin/env bash
# Acceptance 5 (local half): the PR gate command (`scripts/verify.sh --patch-check`) is green on a
# trivial valid patch and red on a deliberately broken one. The other half, that the real CI
# workflow shows green/red on GitHub, cannot be tested here and stays UNVERIFIED.
# Fixture mode only: it needs a controlled tree and creates patches.
set -euo pipefail
# shellcheck source=tests/acceptance/phase-0/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
[ "$FIXTURE" = 1 ] || skip "gate logic is exercised on the fixture tree only (run with --fixture)"
setup

gate() { "$RROOT/scripts/verify.sh" --patch-check >"$WORK/gate.log" 2>&1; }

# Start from a series with only the known-good patches 1 and 3.
printf '# s\nui/0001-foo-tweak.patch\nbuild/0003-baz-tweak.patch\n' >"$RROOT/patches/series"
rm -f "$RROOT/patches/ui/0002-bar-tweak.patch"
gate || { cat "$WORK/gate.log"; fail "gate should be green on valid patches"; }
say "green case OK"

# Broken hunk: mangle a context line so it cannot apply.
bad="$RROOT/patches/ui/0001-foo-tweak.patch"
cp "$bad" "$WORK/good.patch"
sed -i 's/^ foo line 5$/ foo line 5 BROKEN/' "$bad"
if gate; then fail "gate should be RED on a patch that does not apply"; fi
grep -q 'ui/0001-foo-tweak.patch' "$WORK/gate.log" || fail "failure did not name the patch"
say "red case (non-applying patch) OK"
cp "$WORK/good.patch" "$bad"

# Missing header field.
sed -i '/^Origin:/d' "$bad"
if gate; then fail "gate should be RED when header field is missing"; fi
grep -q "Origin" "$WORK/gate.log" || fail "lint did not name the missing field"
say "red case (missing header) OK"
cp "$WORK/good.patch" "$bad"

# Orphan patch not in series.
cp "$bad" "$RROOT/patches/ui/0009-orphan.patch"
if gate; then fail "gate should be RED on an orphan patch file"; fi
rm -f "$RROOT/patches/ui/0009-orphan.patch"
gate || fail "gate should be green again after restoring"
say "PASS: patch gate green on valid, red on broken/headerless/orphan"
