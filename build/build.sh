#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Compile. Incremental: re-running continues where it stopped.
# Usage: build/build.sh [extra ninja targets/args]   (default target: chrome)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/config.sh"
corvid_check_disk
[ -f "$OUT/build.ninja" ] || { echo "run build/configure.sh first" >&2; exit 1; }

ninja="$SRC/third_party/ninja/ninja"
[ -x "$ninja" ] || ninja="$(command -v ninja)"

ccache -z >/dev/null
start=$(date +%s)
echo "build start: $(date -Is)  jobs=$JOBS"
"$ninja" -C "$OUT" -j "$JOBS" "${@:-chrome}"
end=$(date +%s)
echo "build end:   $(date -Is)  elapsed: $(( (end-start)/3600 ))h $(( (end-start)%3600/60 ))m $(( (end-start)%60 ))s"
ccache -s
du -sh "$OUT" "$SRC" "$CCACHE_DIR"
df -h / "$CORVID_WORK"
