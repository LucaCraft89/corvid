# Extension sources (CR-2, resolved 2026-10-09)

Corvid installs extensions from user-configurable sources. The code is `ui/pages/shared/sources.ts` (tested); the UI is the "Extension sources" section of `corvid://extensions`.

- **Default list:** Chrome Web Store and Microsoft Edge Add-ons.
- **User-added:** any Chromium-based store URL (an update endpoint plus a browse URL; https required, `http` allowed only for localhost; no credentials in URLs).
- **Manual install:** a `.crx` file, a `.zip` file, or an unpacked directory (developer-mode style).
- **Nothing is permanent:** every source, including the defaults, can be disabled or removed.
- **Network behavior:** a source is contacted only to install from it or to check updates for an extension installed from it. An idle Corvid contacts none (acceptance 1 stays empty).
- **Terms of service:** using a third-party store from a non-native browser may be subject to that store's terms. The user has accepted that responsibility; Corvid shows a notice next to the list (`extensions.sources.terms`).
- **Preinstalled extensions** (uBlock Origin) come from `extensions/preinstalled.toml`, not from a store, and update only from a source the user configures (`default_update_source = "none"`).
