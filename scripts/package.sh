#!/usr/bin/env bash
# Linux packaging (task 1.13, skill: build-linux). Produces <out>/dist/: tarball always; .deb if dpkg-deb exists;
# .rpm if rpmbuild exists; AppImage if appimagetool exists. Missing tools are reported and skipped, never faked.
#
# Usage: scripts/package.sh linux [--out out/linux-release] [--version X.Y.Z] [--binary chrome]
# Reads names and ids from branding/config.toml (single rename point). UNVERIFIED with a real browser build:
# exercised only with a stand-in binary (tests/packaging-selftest.sh).
set -euo pipefail

platform="${1:-}"; shift || true
[[ "$platform" == "linux" ]] || { echo "usage: $0 linux [--out DIR] [--version V] [--binary NAME]" >&2; exit 2; }
out="out/linux-release"; version=""; binary="chrome"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) out="$2"; shift 2 ;;
    --version) version="$2"; shift 2 ;;
    --binary) binary="$2"; shift 2 ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
done

repo="$(cd "$(dirname "$0")/.." && pwd)"
cfg() { python3 - "$repo/branding/config.toml" "$1" <<'PY'
import sys, tomllib
d = tomllib.load(open(sys.argv[1], "rb"))
cur = d
for k in sys.argv[2].split("."):
    cur = cur[k]
print(cur)
PY
}
name="$(cfg name)"; vendor="$(cfg vendor)"; desktop_id="$(cfg ids.linux_desktop_id)"; short="$(cfg short_name)"
[[ -n "$version" ]] || version="$(cfg version)"
slug="$(echo "$short" | tr 'A-Z ' 'a-z-')"

[[ -x "$repo/$out/$binary" || -x "$out/$binary" ]] || { echo "error: $out/$binary not found; build first (skill build-linux)" >&2; exit 1; }
src="$out"; [[ -d "$src" ]] || src="$repo/$out"
dist="$src/dist"; stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
mkdir -p "$dist"

root="$stage/root"
mkdir -p "$root/opt/$slug" "$root/usr/bin" "$root/usr/share/applications" "$root/usr/share/icons/hicolor/256x256/apps"
cp "$src/$binary" "$root/opt/$slug/$slug"
for f in resources.pak chrome_100_percent.pak chrome_200_percent.pak icudtl.dat v8_context_snapshot.bin snapshot_blob.bin libvk_swiftshader.so vk_swiftshader_icd.json libEGL.so libGLESv2.so libvulkan.so.1 chrome_crashpad_handler; do
  [[ -e "$src/$f" ]] && cp "$src/$f" "$root/opt/$slug/"
done
[[ -d "$src/locales" ]] && cp -r "$src/locales" "$root/opt/$slug/"
ln -s "/opt/$slug/$slug" "$root/usr/bin/$slug"
# Preinstalled extensions (docs/notes/preinstalled-build-step.md): <id>.json files plus the CRXs they point to.
# The browser reads /opt/$slug/extensions (DIR_EXTERNAL_EXTENSIONS) at startup; external_crx paths in the JSON are
# absolute (/opt/$slug/extensions/...) or relative to that directory. Skipped when the build step has not run.
if [[ -d "$src/corvid-preinstalled" ]]; then
  mkdir -p "$root/opt/$slug/extensions"
  cp "$src"/corvid-preinstalled/*.json "$src"/corvid-preinstalled/*.crx "$root/opt/$slug/extensions/" 2>/dev/null || true
  rm -f "$root/opt/$slug/extensions/preinstalled.manifest.json"
  # The generator writes the build-machine path of the CRX; the installed JSON must point at the CRX next to it.
  python3 - "$root/opt/$slug/extensions" <<'PY'
import json, os, shutil, sys
d = sys.argv[1]
for f in os.listdir(d):
    if f.endswith(".json"):
        p = os.path.join(d, f)
        j = json.load(open(p))
        if "external_crx" in j:
            crx = j["external_crx"]
            if os.path.isabs(crx):
                if not os.path.isfile(crx):
                    sys.exit("package.sh: CRX %s named in %s is missing" % (crx, f))
                shutil.copyfile(crx, os.path.join(d, os.path.basename(crx)))
            j["external_crx"] = os.path.basename(crx)
            json.dump(j, open(p, "w"), indent=2)
PY
else
  echo "note: $src/corvid-preinstalled not found; package has no preinstalled extensions" >&2
fi

cat > "$root/usr/share/applications/$desktop_id.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=$name
GenericName=Web Browser
Comment=Modular, private web browser
Exec=$slug %U
Terminal=false
Icon=$desktop_id
Categories=Network;WebBrowser;
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
StartupWMClass=$name
StartupNotify=true
EOF
icon="$repo/branding/icons/256.png"; [[ -f "$icon" ]] && cp "$icon" "$root/usr/share/icons/hicolor/256x256/apps/$desktop_id.png" || echo "note: branding/icons/256.png missing; package has no icon" >&2

built=()

# tarball (always)
tar -C "$root" -czf "$dist/$slug-$version-linux-x86_64.tar.gz" .
built+=("$slug-$version-linux-x86_64.tar.gz")

# .deb
if command -v dpkg-deb >/dev/null; then
  mkdir -p "$root/DEBIAN"
  cat > "$root/DEBIAN/control" <<EOF
Package: $slug
Version: $version
Section: web
Priority: optional
Architecture: amd64
Maintainer: $vendor <noreply@invalid>
Depends: libgtk-3-0 | libgtk-3-0t64, libnss3, libxss1, libasound2 | libasound2t64, libva2, xdg-utils
Description: $name web browser
 Modular, private, Chromium-based browser.
EOF
  dpkg-deb --root-owner-group --build "$root" "$dist/${slug}_${version}_amd64.deb" >/dev/null
  rm -rf "$root/DEBIAN"
  built+=("${slug}_${version}_amd64.deb")
else echo "skip: dpkg-deb not installed (no .deb)" >&2; fi

# .rpm
if command -v rpmbuild >/dev/null; then
  topdir="$stage/rpm"; mkdir -p "$topdir"/{BUILD,RPMS,SOURCES,SPECS}
  cat > "$topdir/SPECS/$slug.spec" <<EOF
Name: $slug
Version: $version
Release: 1
Summary: $name web browser
License: BSD-3-Clause
AutoReqProv: no
Requires: gtk3, nss, libva, xdg-utils
%description
Modular, private, Chromium-based browser.
%install
cp -a $root/. %{buildroot}/
%files
/opt/$slug
/usr/bin/$slug
/usr/share/applications/$desktop_id.desktop
/usr/share/icons/hicolor/256x256/apps/*
EOF
  rpmbuild --define "_topdir $topdir" -bb "$topdir/SPECS/$slug.spec" >/dev/null
  cp "$topdir"/RPMS/*/*.rpm "$dist/"
  built+=("$(basename "$(ls "$topdir"/RPMS/*/*.rpm | head -1)")")
else echo "skip: rpmbuild not installed (no .rpm)" >&2; fi

# AppImage
if command -v appimagetool >/dev/null; then
  app="$stage/$slug.AppDir"; mkdir -p "$app"; cp -a "$root/." "$app/"
  ln -s "opt/$slug/$slug" "$app/AppRun"
  cp "$root/usr/share/applications/$desktop_id.desktop" "$app/"
  [[ -f "$root/usr/share/icons/hicolor/256x256/apps/$desktop_id.png" ]] && cp "$root/usr/share/icons/hicolor/256x256/apps/$desktop_id.png" "$app/"
  ARCH=x86_64 appimagetool "$app" "$dist/$name-$version-x86_64.AppImage" >/dev/null
  built+=("$name-$version-x86_64.AppImage")
else echo "skip: appimagetool not installed (no AppImage)" >&2; fi

printf 'built in %s:\n' "$dist"; printf '  %s\n' "${built[@]}"
