#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# git on the prepared tree ($SRC), tracking only the files Corvid patches.
# History: "base" (files as Helium left them) then one commit per patch,
# whose message is the patch path, e.g. "common/privacy/foo.patch".
#
#   build/srcgit.sh track FILE...   start tracking files BEFORE editing them
#                                   (folds them into "base")
#   build/srcgit.sh <git args>      anything else goes to git, e.g.
#                                   status, diff, log --oneline corvid-base..HEAD
#
# Then build/refresh-patches.sh writes the patches. See docs/patches.md.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/config.sh" >/dev/null
. "$CORVID_REPO/build/srcgit-lib.sh"
[ -d "$SRCGIT" ] || { echo "no $SRCGIT: run build/patch.sh (step corvid-patches) first" >&2; exit 1; }

if [ "${1:-}" != track ]; then
    exec_srcgit() { srcgit "$@"; }
    cd "$SRC"
    exec_srcgit "$@"
    exit
fi
shift
[ $# -gt 0 ] || { echo "usage: build/srcgit.sh track FILE..." >&2; exit 1; }
cd "$SRC"
new=()
for f in "$@"; do
    f="$(realpath --relative-to="$SRC" "$f")"
    [ -f "$f" ] || { echo "not a file: $f" >&2; exit 1; }
    if srcgit ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then
        echo "already tracked: $f"
    else
        new+=("$f")
    fi
done
[ ${#new[@]} -gt 0 ] || exit 0
# The files are untouched by our series, so their current content is their
# base content in every commit. Rewrite base and each patch commit with the
# files added; the work tree is not touched.
blobs=()
for f in "${new[@]}"; do
    blobs+=("$(stat -c %a "$f" | sed 's/^7../100755/;s/^[0-6]../100644/'),$(srcgit hash-object -w -- "$f"),$f")
done
idx="$(mktemp)"; trap 'rm -f "$idx"' EXIT
parent=""
for c in $(srcgit rev-list --reverse corvid-base^! ; srcgit rev-list --reverse corvid-base..HEAD); do
    GIT_INDEX_FILE="$idx" srcgit read-tree "$c"
    for b in "${blobs[@]}"; do GIT_INDEX_FILE="$idx" srcgit update-index --add --cacheinfo "$b"; done
    tree="$(GIT_INDEX_FILE="$idx" srcgit write-tree)"
    parent="$(srcgit log -1 --format=%B "$c" | srcgit commit-tree "$tree" ${parent:+-p "$parent"})"
    [ "$c" = "$(srcgit rev-parse corvid-base)" ] && newbase="$parent"
done
srcgit tag -f corvid-base "$newbase" >/dev/null
srcgit update-ref HEAD "$parent"
srcgit reset -q   # index = new HEAD; work tree unchanged
printf 'now tracking: %s\n' "${new[@]}"
