#!/usr/bin/env bash
# Pin (or re-pin) uBlock Origin in extensions/preinstalled.toml from the official GitHub release asset.
# Usage: scripts/pin-ubo.sh [VERSION]      (default: latest release tag, via the GitHub API; falls back to the toml value)
#        scripts/pin-ubo.sh --verify       (re-download the pinned asset and compare sha256; exit 1 on mismatch)
# Downloads uBlock0_<version>.chromium.zip from https://github.com/gorhill/uBlock/releases, checks that it is the
# MV2 build (manifest_version 2, name "uBlock Origin", version matches), computes sha256 and rewrites version/asset/sha256.
# uBO publishes no checksum file, so the pin is trust-on-first-use: review the diff, and compare against a second
# download from another network before releasing. The extension id is NOT pinned here: Corvid signs its own CRX at
# packaging time, so the id comes from the Corvid signing key.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
toml="$repo/extensions/preinstalled.toml"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

get() { python3 - "$toml" "$1" <<'PY'
import sys, tomllib
d = tomllib.load(open(sys.argv[1], "rb"))
print(d["extension"][0].get(sys.argv[2], ""))
PY
}

mode="pin"; version="${1:-}"
[[ "$version" == "--verify" ]] && { mode="verify"; version="$(get version)"; }
if [[ -z "$version" ]]; then
  version="$(curl -fsS -m 30 https://api.github.com/repos/gorhill/uBlock/releases/latest 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin)["tag_name"])' 2>/dev/null || true)"
  [[ -n "$version" ]] || { version="$(get version)"; echo "note: could not query the latest release; using $version from the toml" >&2; }
fi
[[ "$version" =~ ^[0-9]+(\.[0-9]+)+$ ]] || { echo "error: bad version '$version' (run scripts/pin-ubo.sh <version>)" >&2; exit 1; }

asset="uBlock0_${version}.chromium.zip"
curl -fsSL -m 300 -o "$work/$asset" "https://github.com/gorhill/uBlock/releases/download/$version/$asset"
sha="$(sha256sum "$work/$asset" | cut -d' ' -f1)"

python3 -I - "$work/$asset" "$version" <<'PY'
import sys, zipfile, json
z = zipfile.ZipFile(sys.argv[1])
m = json.loads(z.read("uBlock0.chromium/manifest.json"))
assert m["manifest_version"] == 2, f"expected the MV2 build, got manifest_version {m['manifest_version']}"
assert m["name"] == "uBlock Origin", m["name"]
assert m["version"] == sys.argv[2], f"manifest version {m['version']} != release tag {sys.argv[2]}"
print(f"ok: {m['name']} {m['version']} (MV{m['manifest_version']})")
PY

if [[ "$mode" == "verify" ]]; then
  want="$(get sha256)"
  [[ "$sha" == "$want" ]] || { echo "MISMATCH: pinned $want, downloaded $sha" >&2; exit 1; }
  echo "verified $asset sha256 $sha"; exit 0
fi

python3 - "$toml" "$version" "$asset" "$sha" <<'PY'
import re, sys
p, ver, asset, sha = sys.argv[1:]
s = open(p).read()
for key, val in (("version", ver), ("asset", asset), ("sha256", sha)):
    s, n = re.subn(rf'^{key}\s*=.*$', f'{key} = "{val}"', s, count=1, flags=re.M)
    assert n == 1, key
open(p, "w").write(s)
PY
echo "pinned uBlock Origin $version sha256 $sha in extensions/preinstalled.toml"
