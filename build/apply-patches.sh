#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Apply Corvid's series (patches/common, then patches/linux) to the prepared
# tree, strictly (no fuzz). Also records the tree in $SRCGIT: one "base"
# commit with every file the series touches as it was before, then one commit
# per patch named after it. build/refresh-patches.sh turns those commits back
# into patch files, so editing a patch is: edit $SRC, commit, refresh.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/config.sh"
. "$CORVID_REPO/build/srcgit-lib.sh"

series_patches() { # prints "dir/patch" for every patch, in order
    local d
    for d in common linux; do
        [ -f "$CORVID_REPO/patches/$d/series" ] || continue
        sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$CORVID_REPO/patches/$d/series" | grep -v '^$' | sed "s|^|$d/|"
    done
}
touched_files() { # files a patch reads or writes, existing ones only
    sed -n -E 's#^(---|\+\+\+) [ab]/([^[:space:]]+).*#\2#p' "$1" | sort -u
}

rm -rf "$SRCGIT"
srcgit init -q
srcgit config status.showUntrackedFiles no
srcgit config gc.auto 0
srcgit config core.autocrlf false

mapfile -t PATCHES < <(series_patches)
add_paths() { # add the given NUL-separated paths, if any
    local list; list="$(mktemp)"; cat > "$list"
    [ -s "$list" ] && srcgit add -f -A --pathspec-from-file="$list" --pathspec-file-nul
    rm -f "$list"
}
for p in "${PATCHES[@]}"; do
    [ -f "$CORVID_REPO/patches/$p" ] || { echo "series lists missing patch: patches/$p" >&2; exit 1; }
    touched_files "$CORVID_REPO/patches/$p"
done | sort -u | while read -r f; do
    if [ -e "$SRC/$f" ]; then printf '%s\0' "$f"; fi
done | add_paths
srcgit commit -q --allow-empty -m base
srcgit tag -f corvid-base >/dev/null

for p in "${PATCHES[@]}"; do
    echo "== patches/$p"
    patch -p1 --fuzz=0 --forward --no-backup-if-mismatch -d "$SRC" -i "$CORVID_REPO/patches/$p"
    touched_files "$CORVID_REPO/patches/$p" | tr '\n' '\0' | add_paths
    srcgit commit -q --allow-empty -m "$p"
done
echo "== applied ${#PATCHES[@]} Corvid patch(es); history: build/srcgit.sh log --oneline corvid-base..HEAD"
