---
name: preinstall-extension
description: Bundle an extension (uBlock Origin by default) so it is installed and enabled at first run, and keep it updatable. Use for uBO and any other default extension.
---

# preinstall-extension

## Licensing gate (ask the user first)
uBlock Origin is GPL-3.0. Corvid is BSD-3-Clause. Shipping it unmodified as a separate bundled extension package is generally treated as aggregation, but confirm with the user before the first release and record the decision in `docs/CHANGE-REQUESTS.md` and `docs/PATCH-PROVENANCE.md`. Never modify uBO source inside the Corvid tree.

## Steps
1. Source the MV2 uBlock Origin release from its official GitHub releases (Chromium build); pin version and checksum in `extensions/preinstalled.toml`. Do not rely on the Chrome Web Store (it no longer serves the MV2 version).
2. Package as a CRX/unpacked directory included in the build output; register it through Chromium's external/preinstalled extension provider mechanism (find the current provider code under `chrome/browser/extensions/external_*` and `extensions/browser`), flagged as installed-by-default and user-removable.
3. Enabled and allowed in incognito per user setting (default: ask once in first-run, default on for normal windows).
4. Updates: use `update_url` pointing at a configurable source (see settings); implement update checks through the extension updater without Google endpoints. Record the source in the settings page.
5. First-run: apply uBO's default filter lists from its bundled assets without network fetches until the user opts in to list updates.
6. Test: fresh profile has uBO enabled; blocks ads on the test page; survives restart; can be disabled and removed; removal is not re-added on update.

## Done when
- Above test passes on every shipped platform, and the pinned version/checksum is recorded.

## Android
Same package; verify it with `android-extensions-port`. If performance is poor, measure before building the native-blocker fallback.
