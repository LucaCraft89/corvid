#!/usr/bin/env bash
# Regenerate patch files in patches/ from commits on branch corvid/work in $CORVID_SRC.
#
# Workflow (see skills/add-patch):
#   1. scripts/apply-patches.sh               # one commit per series patch: "corvid: <path>"
#   2. edit Chromium files in $CORVID_SRC, then either
#        - amend/fixup the relevant "corvid: <path>" commit to change an existing patch, or
#        - commit on top with subject "corvid-new: <area>/<slug>" (body = header block) for a new one
#   3. scripts/refresh-patches.sh
#
# Patch order follows commit order. New patches get the next free 4-digit number. The header
# (text before the first "diff --git") is preserved for existing patches; for new patches it is
# taken from the commit body, or a TODO template that scripts/lint-patches.sh rejects.
set -euo pipefail
# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_tree
VER="$(pinned_version)"
require_tag "$VER"
[ "$(src_git rev-parse --abbrev-ref HEAD)" = "corvid/work" ] ||
  die "expected branch corvid/work in $CORVID_SRC (run scripts/apply-patches.sh first)"

PATCHES="$CORVID_ROOT/patches"
next_num() {
  local max=0 n f
  while IFS= read -r f; do
    n="$(basename "$f")"
    n="${n%%-*}"
    n=$((10#$n))
    [ "$n" -gt "$max" ] && max=$n
  done < <(find "$PATCHES" -type f -name '[0-9][0-9][0-9][0-9]-*.patch')
  printf '%04d' $((max + 1))
}

new_series=()
changed=0
while IFS= read -r c; do
  subj="$(src_git log -1 --format=%s "$c")"
  case "$subj" in
    "corvid: "*)
      rel="${subj#corvid: }"
      out="$PATCHES/$rel"
      header=""
      [ -f "$out" ] && header="$(patch_header "$out")"
      ;;
    "corvid-new: "*)
      rel="${subj#corvid-new: }"
      [[ "$rel" =~ ^[a-z0-9-]+/[a-z0-9-]+$ ]] || die "bad new-patch name '$rel' (want <area>/<slug>)"
      rel="${rel%%/*}/$(next_num)-${rel#*/}.patch"
      out="$PATCHES/$rel"
      header="$(src_git log -1 --format=%b "$c")"
      if [ -z "$header" ]; then
        header="Purpose: TODO
Area: ${rel%%/*}
Files: TODO
Rebase risk: TODO
Origin: TODO"
      fi
      ;;
    *) die "unexpected commit on corvid/work: '$subj' (use 'corvid: ' or 'corvid-new: ' subjects)" ;;
  esac
  # Overlay and rendered branding files must never leak into a patch (e.g. via `add -A`).
  while IFS= read -r touched; do
    if [ -e "$CORVID_ROOT/src-overlay/$touched" ] || [ -e "$CORVID_ROOT/branding/templates/$touched.in" ]; then
      die "commit '$subj' touches overlay/branding-rendered file '$touched'; stage only your own files"
    fi
  done < <(src_git diff --name-only "$c^" "$c")
  if src_git diff "$c^" "$c" | grep -Eq '^\+.*\b(google|googleapis|gstatic|googleusercontent|gvt1|gvt2|googlesyndication|google-analytics|withgoogle|youtube|ytimg|withyoutube|doubleclick)\.(invalid)\b'; then
    die "commit '$subj' contains domain-substituted '.invalid' hosts: run scripts/domain-substitute.py --revert before editing, then re-apply"
  fi
  mkdir -p "$(dirname "$out")"
  tmp="$(mktemp)"
  { printf '%s\n' "$header" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'; printf '\n'; } >"$tmp"
  src_git diff --binary --no-color --no-ext-diff --abbrev=12 "$c^" "$c" >>"$tmp"
  if [ ! -f "$out" ] || ! cmp -s "$tmp" "$out"; then
    mv "$tmp" "$out"
    changed=$((changed + 1))
    log "wrote patches/$rel"
  else
    rm -f "$tmp"
  fi
  new_series+=("$rel")
done < <(src_git rev-list --reverse "$VER..HEAD")

old_series="$(series_list)"
{
  { grep -E '^[[:space:]]*#' "$PATCHES/series" || true; }
  if [ "${#new_series[@]}" -gt 0 ]; then printf '%s\n' "${new_series[@]}"; fi
} >"$PATCHES/series.new"
if cmp -s "$PATCHES/series.new" "$PATCHES/series"; then rm -f "$PATCHES/series.new"; else mv "$PATCHES/series.new" "$PATCHES/series"; log "series updated"; fi

# Drop patch files that were in the series and no longer are (commit removed or renamed). Files that were never in the
# series (intent patches still listed in series.phaseN) are left alone.
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  if ! printf '%s\n' "${new_series[@]:-}" | grep -qxF "$rel"; then
    rm -f "$PATCHES/$rel"
    log "removed orphan patches/$rel"
  fi
done <<<"$old_series"

log "refresh done: $changed file(s) changed, ${#new_series[@]} patch(es) in series"
