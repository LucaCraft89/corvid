# Corvid roadmap

Each phase ends with acceptance checks run by the `verify-phase` skill. Do not start a phase until the previous one passes. Tasks within a phase may run in parallel unless marked `after`.

## Phase 0: Foundations
- 0.1 `bootstrap-build-host`: size and set up build host (>=32 GB RAM, >=150 GB disk, many cores, or remote builder with sccache/remote cache). Document in `docs/build-host.md`.
- 0.2 Repo scaffold per AGENTS.md layout; `branding/config.toml` with name=Corvid.
- 0.3 Patch tooling: `fetch`, `apply-patches` (quilt-style), `refresh-patches`, reproducible Chromium version pin.
- 0.4 `rebase-chromium` pipeline: script that bumps the pin, applies patches, reports conflicts per patch. Weekly CI job against Chromium stable.
- 0.5 CI: Linux build + patch-apply check on every PR; build cache.
- 0.6 Provenance and license review of reference patch sets (Helium, ungoogled-chromium, Brave) into `docs/PATCH-PROVENANCE.md`.
- **Accept:** unmodified-but-rebranded Chromium builds on Linux from a clean checkout via one command; rebase script runs end to end on a version bump.

## Phase 1: Linux MVP
- 1.1 `debrand-and-degoogle`: remove Google services, sync, Safe Browsing endpoints, field trials, metrics; zero outbound calls at idle (verify with network capture).
- 1.2 WebUI browser chrome shell: tab strip, toolbar, address bar, side panel host, in a native window shell.
- 1.3 `layout-engine` + `module-manifest`: modules declare slots, settings, permissions; drag-and-drop reorganize; layouts saved as JSON; public UI-mod API v0.
- 1.4 `theme-m3e`: shared tonal-palette engine, Expressive shapes/motion/typography; `platform-color-provider` for GTK/libadwaita (GTK 3/4, GNOME + KDE) with live updates and manual seed override.
- 1.5 `add-webui-page`: custom new tab, settings, extensions, history, downloads, and all error/crash/offline/SSL pages. Audit and block every stock `chrome://` page from user view.
- 1.6 `mv2-maintenance`: keep MV2 enabled alongside MV3; `preinstall-extension` bundles uBlock Origin, on by default, updatable.
- 1.7 `ntp-extension-override`: extensions can replace the new tab page; fall back to Corvid NTP.
- 1.8 Extension compatibility: load-test a top-100 extension list, track failures in `docs/ext-compat.md`.
- **Accept:** idle network capture shows zero third-party calls; uBO blocks on a standard test page; layout can be rearranged and persists across restarts; no stock Chromium screen is reachable; theme follows GTK accent live; top-100 extension pass rate recorded.

## Phase 2: Diagnostics, DevTools, passkeys
- 2.1 `diagnostics-event`: structured event bus (hangs, crashes, network, TLS, DNS, console errors, memory) with local ring buffer and export.
- 2.2 Diagnostics hub page: per-tab live CPU/memory/hang timeline, freeze detector with stack capture, filterable verbose logs.
- 2.3 Error pages show full detail (resolver, cert chain, timings, retry log) with plain-language summary on top.
- 2.4 `devtools-extension`: verbose console mode, performance overlay, hang reports linked into DevTools.
- 2.5 `passkey-authenticator`: built-in encrypted software authenticator (WebAuthn, discoverable credentials, hybrid/caBLE), hardware key support, vault UI, import/export.
- **Accept:** induced renderer hang produces a captured stack and a visible report within 5 s; passkey register and login work on webauthn.io and a major site test; vault encrypted at rest with a user key.

## Phase 3: Windows
- 3.1 `build-windows` pipeline and CI; installer and updater.
- 3.2 Windows system accent color provider into theme engine.
- 3.3 Windows Hello authenticator integration for passkeys.
- **Accept:** all Phase 1 and 2 acceptance checks pass on Windows.

## Phase 4: Self-hosted sync
- 4.1 `sync-server`: small self-hostable server (container image, docs for homelab), E2EE (client-side keys, server sees only ciphertext).
- 4.2 Sync bookmarks, history (optional), passwords, passkeys, settings, UI layouts and modules.
- 4.3 Key recovery flow and device approval.
- **Accept:** two devices converge after offline edits; server compromise test shows no plaintext.

## Phase 5: Android
- 5.1 `build-android` pipeline and CI; Android WebUI chrome adapted to touch; Android dynamic-color provider (Material You).
- 5.2 `android-extensions-port`: port desktop extension stack, touch-friendly extensions UI, background pages/service workers, per-extension permissions.
- 5.3 Android Credential Manager passkeys + built-in vault fallback.
- 5.4 Native blocker fallback if uBO performance on Android is insufficient (measure first).
- **Accept:** uBO installs and blocks on Android; top-100 extension pass rate recorded for Android; passkeys work on a reference site.

## Phase 6: macOS
- 6.1 `build-mac` pipeline, system accent provider, Touch ID passkeys.
- **Accept:** Phase 1 and 2 checks pass on macOS.

## Out of scope
iOS. Gecko/Firefox engine and per-tab engine switching. (Revisit only via `docs/CHANGE-REQUESTS.md`.)

## Standing risks
- Chromium rebase cost grows with every patch to an existing file; prefer `src-overlay/`.
- MV2 is removed upstream; keeping it is an ongoing maintenance track.
- Android extension port is the single hardest task; isolate it and keep it off the critical path.
- Name "Corvid" is a placeholder: verify trademark/domain before any public release.
