#!/usr/bin/env bash
# gn gen an out dir from build/args/linux-<debug|release>.gn (comments stripped) + sccache.
# Usage: scripts/gn-gen.sh <debug|release> [outname]   (outname default Gn<Debug|Release>, under $CORVID_SRC/out)
set -euo pipefail
# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CFG="${1:?debug|release}"
case "$CFG" in debug) D=GnDebug ;; release) D=GnRelease ;; *) die "config must be debug|release" ;; esac
OUT="${2:-$D}"
export PATH="${DEPOT_TOOLS:-$HOME/depot_tools}:$PATH"
cd "$CORVID_SRC"
mkdir -p "out/$OUT"
{
  sed 's/#.*//' "$CORVID_ROOT/build/args/linux-$CFG.gn" | grep -v '^[[:space:]]*$'
  command -v sccache >/dev/null 2>&1 && echo 'cc_wrapper = "sccache"'
} > "out/$OUT/args.gn"
gn gen "out/$OUT"
