#!/usr/bin/env bash
# Bundle ui/pages into $CORVID_SRC/corvid/webui/dist (embedded by //corvid/webui:embed_resources).
# Uses Chromium's own node (the build container has none) and the repo's node_modules (esbuild); `npm ci` first.
set -euo pipefail
# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
NODE="$CORVID_SRC/third_party/node/linux/node-linux-x64/bin/node"
[ -x "$NODE" ] || NODE="$(command -v node)" || die "no node (Chromium third_party/node missing and none on PATH)"
[ -d "$CORVID_ROOT/node_modules/esbuild" ] || die "run 'npm ci' in $CORVID_ROOT first (esbuild)"
mkdir -p "$CORVID_SRC/corvid/webui"
"$NODE" "$CORVID_ROOT/ui/tools/bundle.mjs" "$CORVID_SRC/corvid/webui/dist"
