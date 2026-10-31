#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Extension compatibility test: installs 20 popular extensions from the
# Chrome Web Store and Edge Add-ons into fresh profiles of the built browser,
# checks each one and writes docs/extension-compat.md. Needs the network,
# xdotool, ImageMagick (import) and python3-pil; uses Playwright from webui/
# (cd webui && npm ci). Runs on DISPLAY or starts its own Xvfb. ~15 min.
#
#   build/test-extensions.sh [--only NAME_OR_ID,...] [--binary PATH]
# With --only, docs/extension-compat.md is left alone (results in
# $CORVID_WORK/tmp/extcompat/results.json).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/config.sh"
for t in node xdotool import python3 Xvfb; do
    command -v "$t" >/dev/null || { echo "missing $t (build/deps.sh)" >&2; exit 2; }
done
python3 -c 'import PIL' 2>/dev/null || { echo "missing python3-pil" >&2; exit 2; }
[ -d "$CORVID_REPO/webui/node_modules/playwright-core" ] || { echo "run: cd webui && npm ci" >&2; exit 2; }
[ -x "$BINARY" ] || { echo "no browser at $BINARY" >&2; exit 2; }
if [ -z "${DISPLAY:-}" ]; then
    export DISPLAY=:79
    Xvfb "$DISPLAY" -screen 0 1280x900x24 >/dev/null 2>&1 &
    xvfb=$!
    trap 'kill $xvfb 2>/dev/null' EXIT
    sleep 2
fi
exec node "$CORVID_REPO/build/test-extensions.mjs" --binary "$BINARY" --work "$CORVID_WORK/tmp/extcompat" "$@"
