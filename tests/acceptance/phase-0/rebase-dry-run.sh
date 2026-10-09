#!/usr/bin/env bash
# shellcheck disable=SC2016  # backticks in printf are literal markdown
# Acceptance 4: run rebase.sh to the next available stable tag in a scratch tree; a report is
# produced even if conflicts exist. The real pin file is never touched (script runs from a copy).
#
# Real mode: runs in a scratch git worktree of CORVID_SRC; CORVID_REBASE_TARGET=<tag> overrides the auto-picked target.
set -euo pipefail
# shellcheck source=tests/acceptance/phase-0/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
setup

before_pin="$(cat "$T_ROOT/scripts/CHROMIUM_VERSION")"
if [ "$FIXTURE" = 1 ]; then
  export CORVID_SKIP_FETCH=1
  target="100.0.0.2"
  arg=("$target")
else
  # Never vacuous: target must differ from the pin. Default = newest tag on the same
  # major.minor.build line as the pin that is not the pin itself (else CORVID_REBASE_TARGET).
  pin="$(grep -Ev '^[[:space:]]*(#|$)' "$T_ROOT/scripts/CHROMIUM_VERSION" | head -n1 | tr -d '[:space:]')"
  target="${CORVID_REBASE_TARGET:-}"
  if [ -z "$target" ]; then
    target="$(git ls-remote --tags https://chromium.googlesource.com/chromium/src.git "refs/tags/${pin%.*}.*" |
      sed 's|.*refs/tags/||' | grep -Ex '[0-9]+(\.[0-9]+){3}' | grep -vx "$pin" | sort -V | tail -n1)"
  fi
  [ -n "$target" ] && [ "$target" != "$pin" ] || fail "no rebase target different from pin $pin"
  # Scratch worktree so the real checkout (and its build state) is never reset.
  git -C "$CORVID_SRC" fetch -q origin --no-tags "refs/tags/$target:refs/tags/$target"
  scratch="$WORK/src"
  git -C "$CORVID_SRC" worktree add -q --detach "$scratch" "refs/tags/$pin"
  real_src="$CORVID_SRC"
  trap 'git -C "$real_src" worktree remove --force "$scratch" >/dev/null 2>&1 || true; cleanup' EXIT
  export CORVID_SRC="$scratch" CORVID_SKIP_FETCH=1
  say "rebase $pin -> $target in scratch worktree $scratch"
  arg=("$target")
fi

set +e
"$RROOT/scripts/rebase.sh" "${arg[@]}" >"$WORK/rebase.log" 2>&1
rc=$?
set -e
cat "$WORK/rebase.log"
[ "$rc" -eq 0 ] || [ "$rc" -eq 2 ] || fail "rebase.sh exited $rc (expected 0 clean or 2 conflicts)"

report="$(find "$RROOT/docs/rebase" -name "*.md" | head -n1)"
[ -n "$report" ] && [ -s "$report" ] || fail "no rebase report produced"
head -n 20 "$report"
[ "$(cat "$T_ROOT/scripts/CHROMIUM_VERSION")" = "$before_pin" ] || fail "real pin file was modified"

if [ "$FIXTURE" = 1 ]; then
  [ "$rc" -eq 2 ] || fail "fixture has a deliberate conflict; expected exit 2, got $rc"
  grep -q '| `ui/0001-foo-tweak.patch` | clean |' "$report" || fail "foo should be clean (offset only)"
  grep -q '| `ui/0002-bar-tweak.patch` | conflict |' "$report" || fail "bar should conflict"
  grep -q '| `build/0003-baz-tweak.patch` | fuzz |' "$report" || fail "baz should need fuzz"
  grep -q '^100.0.0.2$' "$RROOT/scripts/CHROMIUM_VERSION" || fail "scratch copy pin not bumped"
fi
say "PASS: report produced at $report (exit $rc)"
