#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Build webui/ for the browser and copy the result into the Chromium tree at
# components/corvid_webui/dist/, where our patch packs it into resources.pak.
# Files whose content did not change keep their time stamp, so ninja only
# rebuilds the pages when the pages changed. Run by build/patch.sh (step
# webui) and before every build by build/build.sh.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/config.sh" >/dev/null
DEST="$SRC/components/corvid_webui/dist"
[ -d "$SRC/components" ] || { echo "no Chromium tree at $SRC" >&2; exit 1; }

cd "$CORVID_REPO/webui"
[ -d node_modules ] || npm ci --no-audit --no-fund
stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
node scripts/build.mjs --chromium "$stage/dist" >/dev/null
mkdir -p "$DEST"
rsync -rc --delete --out-format='webui: %n' "$stage/dist/" "$DEST/"
