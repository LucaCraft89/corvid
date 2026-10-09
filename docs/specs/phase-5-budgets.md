# Phase 5: proposed defaults and open questions

NOT DECISIONS. Every value below is a proposal awaiting the user's answer. Nothing in the build args, CI or code treats
these as final. Answers should be recorded in `docs/CHANGE-REQUESTS.md` (suggested ids CR-A1..A5).

| ID | Question | Proposed default | Why | Impact if changed |
|---|---|---|---|---|
| CR-A1 | Minimum Android version | API 26 (Android 8.0), matching whatever upstream Chromium's own minimum is at the pinned version (check `build/config/android/config.gni` / `minSdkVersion`) | Spec test 2 already expects a pre-12 seed-color fallback, so supporting <12 is implied. Credential Manager platform provider needs API 34 for provider role; client path differs (see passkey design). | Raising to 31 removes the fallback path and simplifies dynamic color. |
| CR-A2 | ABIs | arm64-v8a for devices; x86_64 for emulator/CI only (not shipped); armeabi-v7a optional, not built by default | Smaller CI cost; 32-bit devices are a shrinking share | Adding arm doubles release build/QA cost. `android-arm-release.gn` exists but is not in the CI matrix. |
| CR-A3 | Distribution + signing | Sideload APK and F-Droid-style repo first; no Play Store. Signing key held by the user offline; CI produces unsigned/debug-signed artifacts only | Play policies on ad blocking/extensions; no secrets in CI | CI contains no signing step until decided. |
| CR-A4 | Budgets | See table below | Placeholders to calibrate from first measurements | Used in acceptance test 4 and the native-blocker decision. |
| CR-A5 | Top-100 Android pass-rate target | 80% (desktop proposal CR-6 is 85%) | Mobile has no keyboard/devtools/native messaging | Gates M4. |
| CR-A6 | Foreground service for MV2 background pages | Not used by default | A persistent notification and battery cost; alternative is restart-on-event | Affects uBO behaviour under process death. |
| CR-A7 | Passkeys without Play services | Use platform `android.credentials.CredentialManager` directly (API 34+); below that, Corvid vault only | Upstream Android WebAuthn goes through Google Play services; conflicts with de-Google. UNVERIFIED how the pinned tree is wired. | Defines scope of 5.11. |

## Proposed budgets (placeholders, calibrate on a reference device; record the device model)
| Metric | Proposed budget | Measured by |
|---|---|---|
| Cold start to first paint (release, reference mid-range arm64 device) | <= 1.5 s, and <= +15% vs same-version Chromium baseline built with same flags | `tests/acceptance/phase-5/measure-launch.sh` |
| Idle RSS, 1 tab, uBO on | <= +60 MB vs no extensions | `dumpsys meminfo` |
| Idle wakeups, screen off, 1 h, uBO only | <= 5 app wakeups/h beyond baseline (`dumpsys batterystats`, `dumpsys alarm`) | measurement protocol |
| Battery drain, 30 min mixed browsing scripted, uBO on vs off | uBO on not worse than +10% relative to off | Battery Historian / `batterystats` |
| Page load median (ad-heavy page set), uBO on | not slower than no blocker by > 10% | blocker protocol |
| Top-100 extension pass rate | 80% | `docs/ext-compat-android.md` |
| Idle network, 10 min, clean profile | 0 third-party connections | VPN/proxy capture |
