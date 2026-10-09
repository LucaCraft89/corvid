---
name: build-android
description: Configure, build, test, and package Corvid for Android (APK/AAB), including the touch UI and Material You theming. Use for Phase 5.
---

# build-android

## Host
Linux only. Add `target_os = ["android"]` to `.gclient`, re-run `gclient sync`, run `build/install-build-deps.sh --android`. Needs more disk (add ~50 GB+).

## Steps
1. Apply patches and overlay as usual. Android-specific patches in `patches/android/`, overlay in `src-overlay/corvid/android/`.
2. GN args in `build/args/android-arm64-release.gn` (and `arm`, `x86_64` for emulator): `target_os="android"`, `target_cpu="arm64"`, Google services off (`debrand-and-degoogle`), no Play-services dependencies in the base build.
3. Build the Chrome Android target for the pinned version (check the target name in `chrome/android/BUILD.gn`; commonly `chrome_public_apk`), then bundle target for AAB.
4. UI: Android Java/Kotlin shell hosts the WebUI chrome; layouts use the `mobile` default (bottom-reachable toolbar, touch targets >= 48dp), with the same `layout-engine` and modules.
5. Theming: Material You dynamic color via `platform-color-provider` (Android 12+), seed fallback below.
6. Extensions: see `android-extensions-port`. Passkeys: Credential Manager as default provider plus Corvid vault as selectable provider (see `passkey-authenticator`); registering as a credential provider requires the Android credential provider service APIs.
7. Distribution: sideload APK, F-Droid-style repo, and Play Store optional (ask user; Play policies on extensions/ad blocking apply). Signing keys: ask the user how to manage them.
8. Test on a physical arm64 device and an emulator; run instrumentation tests.

## Done when
- APK installs, launches, passes Phase 1 and 2 checks adapted for mobile, and respects zero-telemetry idle capture.
