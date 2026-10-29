#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Get Helium's repos at the pinned commit and the prepared Chromium source
# tarballs (base + linux-x64 toolchain), then unpack into $SRC.
# Mirrors fetch_sources() in helium-linux scripts/shared.sh. Re-runnable.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/config.sh"
corvid_check_disk

if [ ! -d "$HELIUM_LINUX/.git" ]; then
    git clone "$HELIUM_LINUX_URL" "$HELIUM_LINUX"
fi
git -C "$HELIUM_LINUX" fetch --quiet origin "$HELIUM_LINUX_REV" 2>/dev/null || git -C "$HELIUM_LINUX" fetch --quiet origin
git -C "$HELIUM_LINUX" checkout --quiet "$HELIUM_LINUX_REV"
git -C "$HELIUM_LINUX" submodule update --init
echo "helium-linux:    $(git -C "$HELIUM_LINUX" rev-parse HEAD)"
echo "helium-chromium: $(git -C "$HELIUM_MAIN" rev-parse HEAD)"
echo "chromium:        $(cat "$HELIUM_MAIN/chromium_version.txt")"

stamp="$SRC/.downloaded.stamp"
if [ -f "$stamp" ]; then
    echo "Sources already unpacked in $SRC, skipping (delete $stamp to redo)"
    exit 0
fi

ini=(-i "$HELIUM_MAIN/downloads.ini" "$HELIUM_LINUX/downloads.ini")
"$HELIUM_MAIN/utils/downloads.py" retrieve "${ini[@]}" -c "$DL_CACHE"
rm -rf "$SRC"; mkdir -p "$SRC"
"$HELIUM_MAIN/utils/downloads.py" unpack "${ini[@]}" -c "$DL_CACHE" "$SRC"

"$HELIUM_MAIN/utils/downloads.py" retrieve -i "$HELIUM_MAIN/deps.ini" -c "$DL_CACHE"
"$HELIUM_MAIN/utils/downloads.py" unpack -i "$HELIUM_MAIN/deps.ini" -c "$DL_CACHE" "$SRC"

touch "$stamp"
du -sh "$DL_CACHE" "$SRC"
