---
name: mv2-maintenance
description: Keep Manifest V2 extensions working alongside MV3 in the Corvid fork across Chromium rebases. Use for any extension-system patch, MV2 regression, or after each rebase.
---

# mv2-maintenance

## Context
Upstream Chromium has been phasing out MV2 (deprecation flags, then removal of MV2 code paths and APIs, e.g. blocking `webRequest` for normal extensions). Corvid keeps both. This is a permanent maintenance track.

## Steps each time
1. Locate the current MV2 gating: grep the extensions code for the MV2 deprecation feature flags and manifest-version checks (`ManifestV2`, `manifest_version`, `kExtensionManifestV2*`, `MV2` in `extensions/` and `chrome/browser/extensions/`). Record exact locations in `docs/notes/mv2-gates.md` and update after rebases.
2. Keep the gates patched to "MV2 allowed, no deprecation warnings or auto-disable", in as few patches as possible, grouped under `patches/extensions/`.
3. Make sure blocking `webRequest` (`webRequestBlocking`) works for MV2 extensions; this is what full uBlock Origin relies on. Also keep `declarativeNetRequest` working for MV3.
4. If upstream removed code outright, restore from the last version that had it as an overlay (`src-overlay/corvid/extensions_mv2/`) and keep it compiling; note the Chromium version it was last synced to.
5. Regression tests: load a MV2 test extension (blocking webRequest, persistent background page, content scripts) and an MV3 one; run on every rebase. uBlock Origin full is the canary.
6. Update `docs/ext-compat.md` after each rebase with the current pass rate.

## Done when
- MV2 and MV3 test extensions both load, run, and persist across restart; no deprecation UI appears; canary (uBO) blocks on the test page.
