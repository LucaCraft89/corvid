# Phase 5 spec: Android

Goal: Corvid on Android with the same modular UI (touch layout), Material You dynamic color, full extension support, and passkeys.

## Tracks (independent; extensions is the long pole)
### A. App and UI
| ID | Task | Skill |
|---|---|---|
| 5.1 | Android build pipeline + CI, debug/release APK, AAB | `build-android` |
| 5.2 | Port patches/overlay; Android-specific debrand/de-Google | `debrand-and-degoogle`, `add-patch` |
| 5.3 | Mobile WebUI chrome (tab switcher, bottom toolbar, panels as bottom sheets), `mobile` layout default; layout editing on touch | `layout-engine`, `add-webui-page` |
| 5.4 | Material You dynamic color provider | `platform-color-provider` |
| 5.5 | Custom internal pages responsive for phones/tablets | `add-webui-page` |
| 5.6 | Sync client on Android | `sync-server` |

### B. Extensions
| ID | Task | Skill |
|---|---|---|
| 5.7 | Baseline research of upstream Android extension state | `android-extensions-port` (step 0) |
| 5.8 | Milestones M1-M5 | `android-extensions-port` |
| 5.9 | uBO preinstalled and measured; native blocker fallback only if measurements demand | `preinstall-extension` |
| 5.10 | New-tab extension override on Android | `ntp-extension-override` |

### C. Passkeys
| ID | Task | Skill |
|---|---|---|
| 5.11 | Credential Manager integration; Corvid vault as selectable credential provider | `passkey-authenticator` |

## Acceptance tests (`tests/acceptance/phase-5/`)
1. Debug and release builds install on an Android 12+ physical device and an emulator; launch time and memory recorded.
2. Dynamic color: changing wallpaper/system palette recolors Corvid; Android < 12 uses the seed fallback.
3. Layout: bottom toolbar reachable one-handed; layout edits persist; reset works.
4. Extensions: M1-M5 criteria in `android-extensions-port` verified; `docs/ext-api-android.md` and compat table committed; uBO blocks on the test page and idle wakeups/battery within the budget the user approves.
5. Passkeys: sign in on webauthn.io and two major sites with Credential Manager and with the Corvid vault.
6. Idle network capture on device (via a logging proxy/VPN) clean.
7. Tablet and foldable layouts render correctly.

## Ask the user
- Minimum Android version, ABIs to ship.
- Distribution channels (sideload, F-Droid style repo, Play Store) and signing key management.
- Battery/memory budgets and the top-100 pass-rate target for Android.
