#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Prepare the unpacked tree: prune binaries, apply Helium's patches (main +
# Linux), domain and name substitution, translations, version and resources
# (same order as helium-linux scripts/build.sh). Then ours: rebrand from
# build/branding.conf, then our series (patches/common, patches/linux).
# Our patches apply to the finished, branded tree, so build/refresh-patches.sh
# can regenerate them from that same tree.
# Each step leaves a stamp in $SRC so a re-run skips finished steps.
# Starting over means deleting $SRC and running fetch.sh again.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/config.sh"
[ -f "$SRC/.downloaded.stamp" ] || { echo "run build/fetch.sh first" >&2; exit 1; }
U="$HELIUM_MAIN/utils"

step() { # step <name> <command...>
    local name="$1"; shift
    if [ -f "$SRC/.$name.stamp" ]; then echo "== $name: done before, skipping"; return; fi
    echo "== $name"
    "$@"
    touch "$SRC/.$name.stamp"
}

step prune     "$U/prune_binaries.py" --keep-build-dependencies "$SRC" "$HELIUM_MAIN/pruning.list"
step patched   "$U/patches.py" apply "$SRC" "$HELIUM_MAIN/patches" "$HELIUM_LINUX/patches"
step domsub    "$U/domain_substitution.py" apply -r "$HELIUM_MAIN/domain_regex.list" -f "$HELIUM_MAIN/domain_substitution.list" "$SRC"
step namesub   python3 "$U/name_substitution.py" --sub -t "$SRC" --backup-path "$CORVID_WORK/namesubs.tar"
step i18n      python3 "$U/i18n_apply.py" -t "$SRC"
step version   python3 "$U/helium_version.py" --tree "$HELIUM_MAIN" --platform-tree "$HELIUM_LINUX" --chromium-tree "$SRC"
resources() {
    python3 "$U/generate_resources.py" "$HELIUM_MAIN/resources/generate_resources.txt" "$HELIUM_MAIN/resources"
    python3 "$U/replace_resources.py" "$HELIUM_MAIN/resources/helium_resources.txt" "$HELIUM_MAIN/resources" "$SRC"
}
step resources resources
step brand     python3 "$CORVID_REPO/build/brand.py" --tree "$SRC" --helium "$HELIUM_MAIN"
step corvid-patches "$CORVID_REPO/build/apply-patches.sh"
echo "== tree ready: $SRC"
