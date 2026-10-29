#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Full pipeline: fetch, patch, configure, build. Each step logs to
# build/logs/<step>-<time>.log. Steps that already finished are skipped.
# Usage: build/all.sh          run in this terminal
#        build/all.sh --tmux   run detached; attach: tmux attach -t corvid-build
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$here/config.sh"

if [ "${1:-}" = --tmux ]; then
    tmux new-session -d -s corvid-build "$here/all.sh"
    echo "started tmux session corvid-build; logs in $LOGS"
    exit 0
fi

ts="$(date +%Y%m%d-%H%M%S)"
for s in fetch patch configure build; do
    echo "=== $s ($LOGS/$s-$ts.log)"
    if ! "$here/$s.sh" 2>&1 | tee "$LOGS/$s-$ts.log"; then
        echo "FAILED: $s"
        exit 1
    fi
done
echo "=== all done"
