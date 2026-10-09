#!/usr/bin/env bash
# shellcheck disable=SC2016  # backticks in printf are literal markdown
# Move the pin to a new Chromium tag, try every patch against it, write docs/rebase/<tag>.md.
#
# Usage: scripts/rebase.sh <new-tag> | --latest-stable   [--no-bump]
#
# Exit codes: 0 all patches clean/fuzz, 2 report written but at least one conflict, 1 error.
# Per-patch status: clean (git apply ok), fuzz (only GNU patch with fuzz ok; needs human review),
# conflict (neither). Conflicting patches are skipped and later patches still tried.
#
# Env: CORVID_SRC, CORVID_SKIP_FETCH=1 (tag is already in the tree; used by fixture tests),
#      CORVID_REBASE_DATE (override report date for reproducible output).
# The pin file is rewritten to the new tag unless --no-bump is given.
set -euo pipefail
# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

NEW=""
BUMP=1
for a in "$@"; do
  case "$a" in
    --no-bump) BUMP=0 ;;
    --latest-stable) NEW="LATEST" ;;
    -*) die "unknown argument: $a" ;;
    *) NEW="$a" ;;
  esac
done
[ -n "$NEW" ] || die "usage: rebase.sh <new-tag> | --latest-stable [--no-bump]"

if [ "$NEW" = "LATEST" ]; then
  NEW="$(curl -fsS --max-time 30 \
    'https://versionhistory.googleapis.com/v1/chrome/platforms/linux/channels/stable/versions?pageSize=1' |
    python3 -I -c 'import json,sys; print(json.load(sys.stdin)["versions"][0]["version"])')"
  log "latest stable per versionhistory API: $NEW"
fi
[[ "$NEW" =~ ^[0-9]+(\.[0-9]+){3}$ ]] || die "tag '$NEW' does not look like a Chromium version (N.N.N.N)"

OLD="$(pinned_version)"
DATE="${CORVID_REBASE_DATE:-$(date -u +%F)}"
REPORT_DIR="$CORVID_ROOT/docs/rebase"
REPORT="$REPORT_DIR/$NEW.md"
mkdir -p "$REPORT_DIR"

if [ "${CORVID_SKIP_FETCH:-0}" != 1 ]; then
  "$CORVID_ROOT/scripts/fetch.sh" "$NEW"
fi
require_tree
require_tag "$NEW"
reset_tree_to "$NEW" "corvid/rebase-$NEW"

ROWS="$(mktemp)"
DETAILS="$(mktemp)"
ERR="$(mktemp)"
ERR_GIT="$(mktemp)"
trap 'rm -f "$ROWS" "$DETAILS" "$ERR" "$ERR_GIT"' EXIT
n=0 clean=0 fuzz=0 conflict=0
while IFS= read -r p; do
  [ -n "$p" ] || continue
  n=$((n + 1))
  f="$CORVID_ROOT/patches/$p"
  status=""
  note=""
  if [ ! -f "$f" ]; then
    status="conflict"
    note="patch file missing"
  elif src_git apply --check --whitespace=nowarn "$f" 2>"$ERR"; then
    src_git apply --whitespace=nowarn "$f"
    status="clean"
  elif cp "$ERR" "$ERR_GIT" && (cd "$CORVID_SRC" && patch -p1 --dry-run -F3 --no-backup-if-mismatch -s <"$f" >/dev/null 2>&1); then
    (cd "$CORVID_SRC" && patch -p1 -F3 --no-backup-if-mismatch -s <"$f" >/dev/null)
    status="fuzz"
    note="applies only with fuzz; review the hunk context"
  else
    status="conflict"
    note="$({ grep -E 'patch failed|does not apply|No such file' "$ERR_GIT" || true; } | head -n3 | tr '\n' ';')"
    {
      printf '### %s\n\n```\n' "$p"
      cat "$ERR_GIT"
      printf '```\n\n'
    } >>"$DETAILS"
  fi
  case "$status" in
    clean) clean=$((clean + 1)) ;;
    fuzz) fuzz=$((fuzz + 1)) ;;
    conflict) conflict=$((conflict + 1)) ;;
  esac
  if [ "$status" != conflict ]; then
    src_git add -A
    src_git commit -q --allow-empty --no-verify -m "corvid: $p"
  fi
  printf '| %s | `%s` | %s | %s |\n' "$n" "$p" "$status" "${note:-}" >>"$ROWS"
done < <(series_list)

{
  printf '# Chromium rebase report: %s -> %s\n\n' "$OLD" "$NEW"
  printf -- '- Date: %s\n- Scratch branch: `corvid/rebase-%s` in `CORVID_SRC`\n' "$DATE" "$NEW"
  printf -- '- Patches: %s total, %s clean, %s fuzz, %s conflict\n' "$n" "$clean" "$fuzz" "$conflict"
  printf -- '- Pin file %s\n\n' "$([ "$BUMP" = 1 ] && echo 'updated to the new tag' || echo 'NOT changed (--no-bump)')"
  if [ "$n" -eq 0 ]; then
    printf 'The series is empty; there was nothing to rebase. Pin movement only.\n\n'
  else
    printf '| # | Patch | Status | Notes |\n|---|---|---|---|\n'
    cat "$ROWS"
    printf '\n'
  fi
  if [ "$conflict" -gt 0 ]; then
    printf '## Conflict details\n\n'
    cat "$DETAILS"
  fi
  printf '## Next steps\n\n'
  if [ "$conflict" -gt 0 ] || [ "$fuzz" -gt 0 ]; then
    printf -- '1. Resolve patches in series order (see skills/rebase-chromium); then run `scripts/refresh-patches.sh`.\n'
    printf -- '2. Review every `fuzz` patch by hand; fuzz can apply to the wrong place.\n'
  fi
  printf -- '3. Rebuild, run `scripts/verify.sh --phase <N> --platform linux`, commit pin + patches + this report together.\n'
} >"$REPORT"
log "wrote $REPORT"

if [ "$BUMP" = 1 ]; then
  tmp="$(mktemp)"
  awk -v new="$NEW" 'BEGIN{done=0} /^[[:space:]]*(#|$)/ {print; next} !done {print new; done=1; next} {print}' \
    "$CORVID_ROOT/scripts/CHROMIUM_VERSION" >"$tmp"
  cat "$tmp" >"$CORVID_ROOT/scripts/CHROMIUM_VERSION"
  rm -f "$tmp"
  log "CHROMIUM_VERSION -> $NEW"
fi

log "summary: $n patches: $clean clean, $fuzz fuzz, $conflict conflict"
[ "$conflict" -eq 0 ] || exit 2
