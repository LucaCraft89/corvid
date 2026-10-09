#!/usr/bin/env bash
# Shared helpers for Corvid scripts. Source this file; do not execute it.
# shellcheck shell=bash

# Always derived from this file's location (never inherited from the environment), so a
# copy of scripts/ operates on its own sibling patches/, branding/ and docs/.
CORVID_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORVID_SRC="${CORVID_SRC:-$HOME/chromium/src}"
export CORVID_SRC

log() { printf '[corvid] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# First non-comment, non-blank line of a pin file.
read_pin() {
  { grep -Ev '^[[:space:]]*(#|$)' "$1" || true; } | head -n1 | tr -d '[:space:]'
}

pinned_version() { read_pin "$CORVID_ROOT/scripts/CHROMIUM_VERSION"; }

# Series entries (comments and blanks stripped), one per line.
series_list() {
  { grep -Ev '^[[:space:]]*(#|$)' "$CORVID_ROOT/patches/series" || true; } | sed 's/[[:space:]]*$//'
}

# VCS command against the Chromium tree with a fixed committer identity.
src_git() {
  git -C "$CORVID_SRC" -c user.name=corvid -c user.email=corvid@localhost \
    -c core.autocrlf=false -c commit.gpgsign=false "$@"
}

require_tree() {
  [ -d "$CORVID_SRC/.git" ] || die "no checkout at CORVID_SRC=$CORVID_SRC (run scripts/fetch.sh)"
}

require_tag() {
  src_git rev-parse -q --verify "refs/tags/$1^{commit}" >/dev/null ||
    die "tag $1 not present in $CORVID_SRC (run scripts/fetch.sh)"
}

# Untracked .rej/.orig files in the Chromium tree (one per line).
stray_reject_files() {
  src_git ls-files -o --exclude-standard | { grep -E '\.(rej|orig)$' || true; }
}

# Check out ref $1 as branch $2, discarding local changes and untracked files
# (ignored files, i.e. gclient dependencies, are kept).
reset_tree_to() {
  src_git checkout -q -f -B "$2" "$1"
  src_git clean -fdq
}

# Text before the first "diff --git" line of a patch file (the header block).
patch_header() { sed '/^diff --git /,$d' "$1"; }
