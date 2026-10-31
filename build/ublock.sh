#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Puts the unmodified uBlock Origin release into the tree, in
# third_party/ublock_origin/: the signed .crx from its authors, its licence,
# README.chromium (for the credits page), BUILD.gn and the install entry
# <id>.json. Version, checksum and id: build/ublock.conf. Patch step "ublock"
# (build/patch.sh); safe to run again.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/config.sh"
. "$CORVID_REPO/build/ublock.conf"

name="uBlock0_${UBLOCK_VERSION}.chromium.crx"
crx="$DL_CACHE/$name"
mkdir -p "$DL_CACHE"
if [ ! -f "$crx" ]; then
    curl -fL --retry 3 -o "$crx.part" \
        "https://github.com/gorhill/uBlock/releases/download/${UBLOCK_VERSION}/${name}"
    mv "$crx.part" "$crx"
fi
echo "${UBLOCK_SHA256}  $crx" | sha256sum -c --quiet - || {
    echo "ublock: checksum mismatch for $crx" >&2; exit 1; }

dest="$SRC/third_party/ublock_origin"
mkdir -p "$dest"
# Check id and version, take the licence out of the package.
python3 -I - "$crx" "$UBLOCK_ID" "$UBLOCK_VERSION" "$dest/LICENSE.txt" <<'PY'
import io, json, struct, sys, zipfile
path, want_id, want_version, licence = sys.argv[1:]
data = open(path, 'rb').read()
if data[:4] != b'Cr24' or struct.unpack('<I', data[4:8])[0] != 3:
    sys.exit('ublock: not a CRX3 file')
hlen = struct.unpack('<I', data[8:12])[0]
header = data[12:12 + hlen]
def fields(b):
    i = 0
    while i < len(b):
        key = shift = 0
        while True:
            c = b[i]; i += 1; key |= (c & 0x7f) << shift; shift += 7
            if c < 0x80: break
        if key & 7 != 2: sys.exit('ublock: unexpected CRX header')
        n = shift = 0
        while True:
            c = b[i]; i += 1; n |= (c & 0x7f) << shift; shift += 7
            if c < 0x80: break
        yield key >> 3, b[i:i + n]; i += n
crx_id = None
for f, v in fields(header):
    if f == 10000:  # signed_header_data
        for f2, v2 in fields(v):
            if f2 == 1:
                crx_id = ''.join(chr(97 + (x >> 4)) + chr(97 + (x & 15)) for x in v2)
if crx_id != want_id:
    sys.exit(f'ublock: package id {crx_id}, expected {want_id}')
z = zipfile.ZipFile(io.BytesIO(data[12 + hlen:]))
manifest = json.loads(z.read('manifest.json'))
if manifest['version'] != want_version:
    sys.exit(f"ublock: package version {manifest['version']}, expected {want_version}")
open(licence, 'wb').write(z.read('LICENSE.txt'))
PY
cp "$crx" "$dest/ublock_origin.crx"
printf '{\n  "external_crx": "ublock_origin.crx",\n  "external_version": "%s"\n}\n' \
    "$UBLOCK_VERSION" > "$dest/$UBLOCK_ID.json"
sed "s/UBLOCK_VERSION/$UBLOCK_VERSION/" "$CORVID_REPO/build/ublock/README.chromium" > "$dest/README.chromium"
sed "s/UBLOCK_ID/$UBLOCK_ID/" "$CORVID_REPO/build/ublock/BUILD.gn" > "$dest/BUILD.gn"
echo "ublock: uBlock Origin $UBLOCK_VERSION ($UBLOCK_ID) -> $dest"
