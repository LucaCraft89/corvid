#!/usr/bin/env bash
# Shared helpers for Phase 0 acceptance tests. Source; do not execute.
# shellcheck shell=bash
#
# Modes:
#   real     (default)           uses the real Chromium checkout at $CORVID_SRC.
#   fixture  (CORVID_FIXTURE=1)  uses a tiny fake repo with tags 100.0.0.1 / 100.0.0.2 and
#                                fixture patches. Tests tooling logic only, never a Chromium build.
# Exit codes used by tests: 0 pass, 77 skip, anything else fail.

T_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
FIXTURE="${CORVID_FIXTURE:-0}"
WORK=""

say() { printf '[test] %s\n' "$*"; }
fail() { printf '[test] FAIL: %s\n' "$*" >&2; exit 1; }
skip() { printf '[test] SKIP: %s\n' "$*"; exit 77; }
cleanup() { [ -z "$WORK" ] || rm -rf "$WORK"; }

fx_git() { git -C "$WORK/src" -c user.name=fixture -c user.email=fixture@localhost -c commit.gpgsign=false "$@"; }

# Copy the parts of the repo the scripts need into $WORK/root so tests never modify the real
# CHROMIUM_VERSION, patches/ or docs/rebase/.
copy_root() {
  mkdir -p "$WORK/root"
  local d
  for d in scripts branding patches src-overlay ui theme modules package.json; do cp -a "$T_ROOT/$d" "$WORK/root/$d"; done
  # ui/ is bundled into the overlay by scripts/build-ui.sh (esbuild from the repo's node_modules).
  ln -s "$T_ROOT/node_modules" "$WORK/root/node_modules"
  mkdir -p "$WORK/root/docs/rebase"
  # G2 substitution/render scripts read the allowlist from the repo root.
  cp "$T_ROOT/docs/network-allowlist.md" "$WORK/root/docs/"
  RROOT="$WORK/root"
}

write_patch() { # <series-path> <header-purpose> <diff-file>
  local dest="$RROOT/patches/$1"
  mkdir -p "$(dirname "$dest")"
  {
    printf 'Purpose: %s\nArea: %s\nFiles: see diff\nRebase risk: low because fixture\nOrigin: original\n\n' "$2" "${1%%/*}"
    cat "$3"
  } >"$dest"
  printf '%s\n' "$1" >>"$RROOT/patches/series"
}

make_fixture() {
  mkdir -p "$WORK/src/chrome/app/theme/chromium"
  git -C "$WORK/src" init -q
  local s="$WORK/src" i
  for f in foo bar; do for i in $(seq 1 10); do echo "$f line $i"; done >"$s/$f.cc"; done
  for i in $(seq 1 20); do echo "baz line $i"; done >"$s/baz.cc"
  echo "PRODUCT_FULLNAME=Chromium" >"$s/chrome/app/theme/chromium/BRANDING"
  printf 'Credits\nCorvid Project thanks the Chromium authors.\n' >"$s/CREDITS"
  fx_git add -A
  fx_git commit -q -m "base"
  fx_git tag 100.0.0.1
  # Build three patches against v1 (kept as committed diffs, then reverted).
  sed -i '6s/.*/foo line 6 PATCHED/' "$s/foo.cc"
  fx_git diff --binary --no-color --no-ext-diff --abbrev=12 >"$WORK/p1.diff"; fx_git checkout -q -- .
  sed -i '5s/.*/bar line 5 PATCHED/' "$s/bar.cc"
  fx_git diff --binary --no-color --no-ext-diff --abbrev=12 >"$WORK/p2.diff"; fx_git checkout -q -- .
  sed -i '10s/.*/baz line 10 PATCHED/' "$s/baz.cc"
  fx_git diff --binary --no-color --no-ext-diff --abbrev=12 >"$WORK/p3.diff"; fx_git checkout -q -- .
  # v2: shifts foo (offset: still clean), rewrites bar line 5 (conflict), touches baz context (fuzz).
  sed -i '1i new first line' "$s/foo.cc"
  sed -i '5s/.*/bar line 5 UPSTREAM/' "$s/bar.cc"
  sed -i '7s/.*/baz line 7 UPSTREAM/' "$s/baz.cc"
  fx_git commit -q -am "v2"
  fx_git tag 100.0.0.2
  fx_git checkout -q --detach 100.0.0.1
  # root copy with fixture series/pin/overlay
  copy_root
  printf '# fixture series\n' >"$RROOT/patches/series"
  printf '# fixture pin\n100.0.0.1\n' >"$RROOT/scripts/CHROMIUM_VERSION"
  write_patch ui/0001-foo-tweak.patch "tweak foo" "$WORK/p1.diff"
  write_patch ui/0002-bar-tweak.patch "tweak bar" "$WORK/p2.diff"
  write_patch build/0003-baz-tweak.patch "tweak baz" "$WORK/p3.diff"
  mkdir -p "$RROOT/src-overlay/extra"
  echo "overlay file" >"$RROOT/src-overlay/extra/overlay.txt"
  export CORVID_SRC="$s"
}

# Sets WORK, RROOT, CORVID_SRC. Skips (77) in real mode when no real tree exists.
setup() {
  WORK="$(mktemp -d)"
  trap cleanup EXIT
  if [ "$FIXTURE" = 1 ]; then
    make_fixture
    say "mode=fixture src=$CORVID_SRC"
  else
    CORVID_SRC="${CORVID_SRC:-$HOME/chromium/src}"
    [ -d "$CORVID_SRC/.git" ] || skip "no real Chromium checkout at $CORVID_SRC (run scripts/fetch.sh); UNVERIFIED"
    export CORVID_SRC
    copy_root
    say "mode=real src=$CORVID_SRC"
  fi
}

# Fingerprint of the working tree state: HEAD tree + status + hashes of untracked files.
tree_state() {
  {
    git -C "$CORVID_SRC" rev-parse 'HEAD^{tree}'
    git -C "$CORVID_SRC" status --porcelain=v1 -uall
    git -C "$CORVID_SRC" ls-files -o --exclude-standard -z | (cd "$CORVID_SRC" && xargs -0 -r sha256sum)
    git -C "$CORVID_SRC" diff HEAD | sha256sum
  } | sha256sum | cut -d' ' -f1
}
