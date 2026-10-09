#!/usr/bin/env bash
# Static checks on patches/: series entries exist, naming, required header, no orphans/duplicates.
# Does not need a Chromium tree. Exit 1 on any problem.
set -euo pipefail
# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

bad=0
fail() { log "lint: $*"; bad=1; }

declare -A seen=()
while IFS= read -r p; do
  [ -n "$p" ] || continue
  f="$CORVID_ROOT/patches/$p"
  if [[ ! "$p" =~ ^[a-z0-9-]+/[0-9]{4}-[a-z0-9-]+\.patch$ ]]; then
    fail "$p: name must match <area>/<NNNN>-<slug>.patch"
  fi
  if [ -n "${seen[$p]:-}" ]; then fail "$p: listed twice in series"; fi
  seen[$p]=1
  if [ ! -f "$f" ]; then fail "$p: listed in series but file missing"; continue; fi
  header="$(patch_header "$f")"
  for field in Purpose Area Files "Rebase risk" Origin; do
    if ! printf '%s\n' "$header" | grep -Eq "^$field:[[:space:]]*[^[:space:]]"; then
      fail "$p: header missing or empty field '$field:'"
    fi
  done
  if printf '%s\n' "$header" | grep -q 'TODO'; then fail "$p: header still contains TODO"; fi
  if ! grep -q '^diff --git ' "$f"; then fail "$p: contains no diff"; fi
done < <(series_list)

while IFS= read -r f; do
  rel="${f#"$CORVID_ROOT"/patches/}"
  if [ -z "${seen[$rel]:-}" ]; then fail "$rel: patch file not listed in series"; fi
done < <(find "$CORVID_ROOT/patches" -type f -name '*.patch' | sort)

if [ "$bad" = 0 ]; then log "lint-patches OK ($(series_list | grep -c . || true) patch(es))"; fi
exit "$bad"
