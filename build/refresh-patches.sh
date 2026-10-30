#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Regenerate patches/common and patches/linux from the working tree.
# Every srcgit commit after "base" becomes the patch its message names, and
# the series files are rewritten in commit order.
#
#   build/refresh-patches.sh                  commits only; refuses if the
#                                             tree has uncommitted changes
#   build/refresh-patches.sh --into DIR/NAME  first commit the uncommitted
#                                             changes into that patch (new
#                                             patch or folded into the old one)
#
# DIR is common or linux. See docs/patches.md.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/config.sh" >/dev/null
. "$CORVID_REPO/build/srcgit-lib.sh"
[ -d "$SRCGIT" ] || { echo "no $SRCGIT: run build/patch.sh first" >&2; exit 1; }
cd "$SRC"

INTO=""
[ "${1:-}" = --into ] && { INTO="${2:?--into needs DIR/NAME.patch}"; shift 2; }
[ $# -eq 0 ] || { echo "unknown argument: $1" >&2; exit 1; }

dirty() { ! srcgit diff --quiet HEAD --; }

if [ -n "$INTO" ]; then
    [[ "$INTO" =~ ^(common|linux)/[A-Za-z0-9._/-]+\.patch$ ]] || { echo "--into wants common/... or linux/....patch" >&2; exit 1; }
    dirty || { echo "nothing to commit into $INTO"; }
    if dirty; then
        srcgit add -u
        target="$(srcgit log --format='%H %s' corvid-base..HEAD | awk -v p="$INTO" '$2 == p {print $1; exit}')"
        if [ -z "$target" ]; then
            srcgit commit -q -m "$INTO"
            echo "new patch: $INTO"
        else
            srcgit commit -q --fixup="$target"
            GIT_SEQUENCE_EDITOR=: srcgit rebase -q -i --autosquash corvid-base
            echo "updated patch: $INTO"
        fi
    fi
elif dirty; then
    echo "uncommitted changes in tracked files:" >&2
    srcgit diff --stat HEAD -- >&2
    echo "use --into common/NAME.patch (or linux/...), or commit them with build/srcgit.sh" >&2
    exit 1
fi

declare -A keep=()
for d in common linux; do : > "$CORVID_REPO/patches/$d/series.new"; done
while read -r sha subject; do
    [[ "$subject" =~ ^(common|linux)/.+\.patch$ ]] || { echo "commit $sha: message must be DIR/NAME.patch, got '$subject'" >&2; exit 1; }
    d="${subject%%/*}"; rel="${subject#*/}"
    [ -z "${keep[$subject]:-}" ] || { echo "two commits for $subject; squash them (build/srcgit.sh rebase -i corvid-base)" >&2; exit 1; }
    keep[$subject]=1
    out="$CORVID_REPO/patches/$subject"
    mkdir -p "$(dirname "$out")"
    # Plain unified diff with a/ b/ prefixes; no index lines, so patches only
    # change when the code does.
    srcgit diff --no-color --no-renames --no-ext-diff -U3 "$sha^" "$sha" -- \
        | grep -v -E '^(index [0-9a-f]+\.\.|diff --git )' > "$out"
    echo "$rel" >> "$CORVID_REPO/patches/$d/series.new"
    echo "wrote patches/$subject"
done < <(srcgit log --reverse --format='%H %s' corvid-base..HEAD)

for d in common linux; do
    mv "$CORVID_REPO/patches/$d/series.new" "$CORVID_REPO/patches/$d/series"
    [ -s "$CORVID_REPO/patches/$d/series" ] || rm "$CORVID_REPO/patches/$d/series"
    # Patch files no longer in any commit are removed.
    find "$CORVID_REPO/patches/$d" -name '*.patch' -print0 | while IFS= read -r -d '' f; do
        rel="${f#"$CORVID_REPO/patches/"}"
        [ -n "${keep[$rel]:-}" ] || { rm "$f"; echo "removed patches/$rel"; }
    done
    find "$CORVID_REPO/patches/$d" -mindepth 1 -type d -empty -delete
done
echo "== refreshed ${#keep[@]} patch(es)"
