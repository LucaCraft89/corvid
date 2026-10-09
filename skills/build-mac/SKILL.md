---
name: build-mac
description: Configure, build, sign, notarize, and package Corvid for macOS (arm64 first). Use for Phase 6.
---

# build-mac

## Host
macOS with the Xcode version required by the pinned Chromium (check the official macOS build doc; it changes). Apple hardware or a cloud Mac runner.

## Steps
1. Same fetch/apply flow as Linux (`fetch-and-apply-patches`).
2. GN args in `build/args/mac-arm64-release.gn` (`target_cpu="arm64"`; add `x64` for Intel if the user wants it). Google services off.
3. `autoninja -C out/Release chrome`; package the `.app`, then a `.dmg`.
4. Signing and notarization: requires the user's Apple Developer account; ask for the signing identity and notarization credentials handling. Never store credentials in the repo.
5. Integrations: native menus, full-screen, traffic-light placement in the WebUI chrome, system accent (`platform-color-provider`), Touch ID passkeys (`passkey-authenticator`).
6. Updater: same Corvid updater design as Windows (`docs/specs/updater.md`).

## Done when
- Notarized `.dmg` installs on a clean macOS, launches without Gatekeeper warnings, and passes the Phase 6 checks.
