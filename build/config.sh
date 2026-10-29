# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Shared settings for the build scripts. Source it, do not run it.
# Everything heavy lives under CORVID_WORK (the VM's 300 GB data drive).

CORVID_WORK="${CORVID_WORK:-/work}"

# Helium platform repo and the commit we build. helium-chromium (the main
# patch set) is its git submodule, pinned by that commit.
HELIUM_LINUX_URL="https://github.com/imputnet/helium-linux.git"
HELIUM_LINUX_REV="${HELIUM_LINUX_REV:-f6d9a70b2b2c73b12ebb9dacf7deb49632ffe15b}"

ARCH="${ARCH:-x64}"
JOBS="${JOBS:-22}"

CORVID_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELIUM_LINUX="$CORVID_WORK/helium-linux"
HELIUM_MAIN="$HELIUM_LINUX/helium-chromium"
DL_CACHE="$CORVID_WORK/downloads"
SRC="$CORVID_WORK/src"
OUT="$SRC/out/Default"
LOGS="$CORVID_REPO/build/logs"

export CCACHE_DIR="$CORVID_WORK/ccache"
export CCACHE_MAXSIZE="${CCACHE_MAXSIZE:-80G}"
# Chromium paths differ only by checkout location; make hits path-independent.
export CCACHE_BASEDIR="$SRC"
# Chromium 156 compiles with Clang modules; ccache refuses 80%+ of calls without "modules" sloppiness and depend mode.
export CCACHE_SLOPPINESS="modules,time_macros,include_file_mtime,include_file_ctime,file_stat_matches"
export CCACHE_DEPEND=1   # ccache only caches -fmodules calls in direct + depend mode
export TMPDIR="$CORVID_WORK/tmp"

mkdir -p "$CORVID_WORK" "$DL_CACHE" "$CCACHE_DIR" "$TMPDIR" "$LOGS"
# Store the size cap in the cache itself so plain `ccache -s` agrees.
grep -q '^max_size' "$CCACHE_DIR/ccache.conf" 2>/dev/null || ccache -M "$CCACHE_MAXSIZE" >/dev/null

# Refuse to run if CORVID_WORK is on the root filesystem.
corvid_check_disk() {
    local work_dev root_dev
    work_dev="$(df --output=source "$CORVID_WORK" | tail -1)"
    root_dev="$(df --output=source / | tail -1)"
    if [ "$work_dev" = "$root_dev" ]; then
        echo "CORVID_WORK=$CORVID_WORK is on the root disk ($root_dev). Mount the data drive first." >&2
        exit 1
    fi
    df -h / "$CORVID_WORK"
}
