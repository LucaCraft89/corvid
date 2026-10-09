#!/usr/bin/env bash
# Exercises scripts/package.sh with a stand-in binary (NOT a browser) to check the packaging logic only.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/out"
printf '#!/bin/sh\necho "standin 0.0.0"\n' > "$tmp/out/chrome"; chmod +x "$tmp/out/chrome"
echo data > "$tmp/out/resources.pak"
"$repo/scripts/package.sh" linux --out "$tmp/out" --version 0.0.1
tar -tzf "$tmp/out/dist/"*.tar.gz | grep -q 'opt/corvid/corvid' || { echo "FAIL tarball missing binary"; exit 1; }
tar -xzOf "$tmp/out/dist/"*.tar.gz ./usr/share/applications/org.corvid.Corvid.desktop | grep -q '^Name=Corvid' || { echo "FAIL desktop file"; exit 1; }
if command -v dpkg-deb >/dev/null; then
  dpkg-deb -I "$tmp/out/dist/"*.deb | grep -q 'Package: corvid' || { echo "FAIL deb control"; exit 1; }
  dpkg-deb -c "$tmp/out/dist/"*.deb | grep -q 'usr/bin/corvid' || { echo "FAIL deb symlink"; exit 1; }
fi
echo "PASS packaging-selftest (stand-in binary; says nothing about the real browser)"
