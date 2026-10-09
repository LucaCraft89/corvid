# Phase 6 spec: macOS

Goal: macOS (Apple Silicon first, Intel optional) with feature parity.

## Tasks
| ID | Task | Skill |
|---|---|---|
| 6.1 | macOS build host/CI (Xcode per Chromium's current requirement), pipeline | `bootstrap-build-host`, `build-mac` |
| 6.2 | Fix macOS-specific build errors in patches/overlay | `add-patch` |
| 6.3 | Native window integration for WebUI chrome (traffic lights, full-screen, native menus) | `add-webui-page` |
| 6.4 | Accent/appearance provider | `platform-color-provider` |
| 6.5 | Touch ID platform authenticator + software fallback | `passkey-authenticator` |
| 6.6 | `.dmg`, notarization, updater | `build-mac`, `package-release` |

## Acceptance tests (`tests/acceptance/phase-6/`)
1. Phase 1, 2, and 4 suites pass on current macOS (arm64).
2. Accent and light/dark changes update Corvid live.
3. Passkey sign-in with Touch ID and with the software authenticator.
4. `.dmg` installs, passes Gatekeeper with notarization, updates, uninstalls cleanly.
5. Idle network capture clean.

## Ask the user
- Apple Developer account/notarization plan; Intel support; whether to build on Apple hardware or a cloud Mac runner.
