#!/usr/bin/env bash
# Fetch the pinned Chromium version (scripts/CHROMIUM_VERSION) into $CORVID_SRC.
#
# Usage: scripts/fetch.sh [TAG]      TAG overrides the pin (used by rebase.sh; the pin file is not modified)
#
# Env:
#   CORVID_SRC          checkout path (default ~/chromium/src; basename must be "src")
#   DEPOT_TOOLS         depot_tools path (default ~/depot_tools)
#   CORVID_FETCH_MODE   full (default) | patch-only
#                       patch-only = partial clone + sparse checkout of only the files the
#                       patch series touches; enough for patch-apply checks, NOT buildable.
#
# UNVERIFIED: the full mode needs network access to chromium.googlesource.com and ~100+ GB;
# it has not been run in the authoring sandbox.
set -euo pipefail
# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TAG="${1:-$(pinned_version)}"
[ -n "$TAG" ] || die "no Chromium version pinned"
DEPOT_TOOLS="${DEPOT_TOOLS:-$HOME/depot_tools}"
MODE="${CORVID_FETCH_MODE:-full}"
CHROMIUM_URL="${CORVID_CHROMIUM_URL:-https://chromium.googlesource.com/chromium/src.git}"

ensure_depot_tools() {
  local rev
  rev="$(read_pin "$CORVID_ROOT/scripts/DEPOT_TOOLS_REV")"
  if [ ! -d "$DEPOT_TOOLS/.git" ]; then
    log "cloning depot_tools into $DEPOT_TOOLS"
    git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git "$DEPOT_TOOLS"
  fi
  if [ -n "$rev" ]; then
    git -C "$DEPOT_TOOLS" fetch -q origin
    git -C "$DEPOT_TOOLS" checkout -q "$rev"
  else
    log "WARNING: scripts/DEPOT_TOOLS_REV is unset; depot_tools is NOT pinned (build is not reproducible)"
  fi
  export PATH="$DEPOT_TOOLS:$PATH"
  export DEPOT_TOOLS_UPDATE=0
}

series_touched_files() {
  local p
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    sed -n 's|^diff --git a/\(.*\) b/.*|\1|p' "$CORVID_ROOT/patches/$p"
  done < <(series_list) | sort -u
}

fetch_patch_only() {
  if [ ! -d "$CORVID_SRC/.git" ]; then
    mkdir -p "$CORVID_SRC"
    git -C "$CORVID_SRC" init -q
    git -C "$CORVID_SRC" remote add origin "$CHROMIUM_URL"
  fi
  git -C "$CORVID_SRC" config extensions.partialClone origin 2>/dev/null || true
  git -C "$CORVID_SRC" fetch -q --depth 1 --filter=blob:none origin "refs/tags/$TAG:refs/tags/$TAG"
  git -C "$CORVID_SRC" sparse-checkout init --no-cone
  local files
  files="$(series_touched_files)"
  # shellcheck disable=SC2086
  git -C "$CORVID_SRC" sparse-checkout set --no-cone /BUILD.gn $files
  reset_tree_to "$TAG" corvid/work
}

fetch_full() {
  ensure_depot_tools
  [ "$(basename "$CORVID_SRC")" = "src" ] || die "CORVID_SRC must end in /src for gclient (got $CORVID_SRC)"
  local parent
  parent="$(dirname "$CORVID_SRC")"
  mkdir -p "$parent"
  if [ ! -d "$CORVID_SRC/.git" ]; then
    log "fetching Chromium (this is large) into $parent"
    (cd "$parent" && fetch --nohooks chromium)
  fi
  src_git fetch -q origin "refs/tags/$TAG:refs/tags/$TAG"
  src_git checkout -q -f --detach "$TAG"
  log "gclient sync at $TAG"
  (cd "$parent" && gclient sync -D --with_branch_heads --with_tags -r "src@$TAG")
}

log "fetch: version=$TAG mode=$MODE src=$CORVID_SRC"
case "$MODE" in
  full) fetch_full ;;
  patch-only) fetch_patch_only ;;
  *) die "unknown CORVID_FETCH_MODE=$MODE" ;;
esac
log "fetch done"
