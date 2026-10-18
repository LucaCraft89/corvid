#!/usr/bin/env bash
# Reset $CORVID_SRC to the pinned tag, apply patches/series, copy src-overlay/, render branding.
#
# Usage: scripts/apply-patches.sh [--no-overlay] [--no-branding]
#
# Each patch is applied with `git apply`, falling back to `git apply --3way`, and committed on
# branch corvid/work as "corvid: <series path>" so refresh-patches.sh can regenerate it later.
# Stops at the first failure and names the patch, file and hunk. Idempotent: it always resets
# to the pinned tag first, so running it twice yields the same tree.
#
# Env: CORVID_SRC, CORVID_BRANDING_CONFIG (override branding/config.toml; used by tests).
set -euo pipefail
# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DO_OVERLAY=1
DO_BRANDING=1
for a in "$@"; do
  case "$a" in
    --no-overlay) DO_OVERLAY=0 ;;
    --no-branding) DO_BRANDING=0 ;;
    *) die "unknown argument: $a" ;;
  esac
done

require_tree
VER="$(pinned_version)"
[ -n "$VER" ] || die "no Chromium version pinned"
require_tag "$VER"

reset_tree_to "$VER" corvid/work
log "tree reset to $VER"

ERR="$(mktemp)"
trap 'rm -f "$ERR"' EXIT
printf '%-5s %-55s %s\n' "#" "PATCH" "RESULT"
n=0
while IFS= read -r p; do
  [ -n "$p" ] || continue
  n=$((n + 1))
  f="$CORVID_ROOT/patches/$p"
  if [ ! -f "$f" ]; then
    printf '%-5s %-55s %s\n' "$n" "$p" "MISSING"
    die "patch listed in series but file not found: patches/$p"
  fi
  method=""
  if src_git apply --whitespace=nowarn "$f" 2>"$ERR"; then
    method="applied"
  elif src_git apply --3way --whitespace=nowarn "$f" 2>"$ERR"; then
    method="applied (3way)"
  else
    printf '%-5s %-55s %s\n' "$n" "$p" "FAILED"
    log "patch $p failed; git reported:"
    sed 's/^/    /' "$ERR" >&2
    die "stopped at patch #$n: $p"
  fi
  src_git add -A
  src_git commit -q --allow-empty --no-verify -m "corvid: $p"
  printf '%-5s %-55s %s\n' "$n" "$p" "$method"
done < <(series_list)
log "$n patch(es) applied"

if [ "$DO_OVERLAY" = 1 ]; then
  OVERLAY="$CORVID_ROOT/src-overlay"
  count=0
  while IFS= read -r -d '' f; do
    rel="${f#"$OVERLAY"/}"
    if [ -n "$(src_git ls-files -- "$rel")" ]; then
      die "overlay file collides with upstream/patched path: $rel (use a patch, see add-patch)"
    fi
    count=$((count + 1))
  done < <(find "$OVERLAY" -type f ! -name '.gitkeep' -print0)
  (cd "$OVERLAY" && tar --exclude='.gitkeep' -cf - .) | tar -xf - -C "$CORVID_SRC"
  log "overlay: $count file(s) copied"
  "$CORVID_ROOT/scripts/build-ui.sh"
fi

if [ "$DO_BRANDING" = 1 ]; then
  python3 -I "$CORVID_ROOT/scripts/render-branding.py" \
    --config "${CORVID_BRANDING_CONFIG:-$CORVID_ROOT/branding/config.toml}" --tree "$CORVID_SRC"
fi

if [ "${CORVID_NO_DOMAIN_SUBSTITUTION:-0}" != 1 ]; then
  python3 -I "$CORVID_ROOT/scripts/domain-substitute.py" --tree "$CORVID_SRC" --allowlist "$CORVID_ROOT/docs/network-allowlist.md"
fi

# User-visible "Chromium" in the string sources becomes the product name (same config as the branding step).
if [ "${CORVID_NO_BRAND_SUBSTITUTION:-0}" != 1 ]; then
  brand_name="$(python3 -I "$CORVID_ROOT/scripts/render-branding.py" --get name --config "${CORVID_BRANDING_CONFIG:-$CORVID_ROOT/branding/config.toml}")"
  python3 -I "$CORVID_ROOT/scripts/brand-substitute.py" --tree "$CORVID_SRC" --name "$brand_name"
fi

stray="$(stray_reject_files)"
if [ -n "$stray" ]; then
  printf '%s\n' "$stray" >&2
  die "stray .rej/.orig files in tree"
fi
log "apply-patches OK (no .rej/.orig)"
