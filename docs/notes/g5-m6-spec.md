# G5 branding and M6 packaging: exact steps (2026-10-13, written without a tree)

Repo state: `branding/config.toml` (name, ids, user agent token, icon source `branding/icons/corvid.svg`); `branding/templates/chrome/app/brand/{app.desktop.in,branding.json.in}` and `.../theme/chromium/BRANDING.in`; `scripts/render-branding.py --tree DIR` renders templates and copies the SVG to `chrome/app/theme/brand/product_logo.svg`; `scripts/package.sh linux` produces tarball, `.deb` (needs `dpkg-deb`), `.rpm` (needs `rpmbuild`), AppImage (needs `appimagetool`), and was only tested with a stand-in binary (`tests/packaging-selftest.sh`).

## G5 branding (builder with tree)
1. `python3 scripts/render-branding.py --tree $CORVID_SRC` (idempotent; check `git status` in the tree shows only expected files).
2. Icons: only an SVG exists. Chromium needs PNGs at several sizes for the product logo and the desktop entry (`chrome/app/theme/chromium/product_logo_{16,22,24,32,48,64,128,256}.png` per the stock layout; VERIFY the list on the tree with `ls chrome/app/theme/chromium | head -50`). Generate with `rsvg-convert` or Inkscape on the builder (not installed here; check `command -v rsvg-convert`), commit the generated PNGs under `branding/icons/` and extend `render-branding.py` to copy them. Do not hand-edit the tree.
3. Strings: user-visible names come from `BRANDING.in` and the grit message files; run the rename acceptance (`tests/phase-0` rename test) with `CORVID_REUSE_BUILD=1` so it checks the existing binary instead of the 15 h clean rebuild.
4. Known exemptions already recorded: Wix `Repeater.corvid` URL (coincidental), `.domain-substituted` manifest name.
5. Product name changes alter many compiled strings: expect a large (not cache-friendly) rebuild of resources and chrome/app; budget 1 to 3 h on 16 vCPU.

## M6 packaging (builder, after a release-config or at least the debug output)
1. `scripts/package.sh linux --out out/GnDebug --binary chrome` produces what the host tools allow; a debug component build is NOT shippable (libs are many shared objects). For a real package the build must be a non-component release (`build/args/linux-release.gn`, only `gn gen`-verified so far, never built; a release build is a separate multi-hour full compile). Decision for Luca: for Thursday, package the debug output as a smoke-test artifact only and call it that, or run the release build (about 4 to 6 h on 16 vCPU cold, much less if the cache helps; use_clang_modules=false).
2. Tools: Ubuntu VM has `dpkg-deb`; `rpmbuild` and `appimagetool` probably not (check, install only with Luca's approval for sudo). Missing tools are SKIPPED in the report by design.
3. Install tests (acceptance 10): needs Debian/Ubuntu and Fedora VMs, X11 and Wayland; only what actually runs gets PASS; the rest SKIPPED with reason.
4. Phase 1 full run: `scripts/verify.sh --phase 1 --platform linux`; reports `docs/reports/M3-G4..G5`, `M4`, `M6`.
