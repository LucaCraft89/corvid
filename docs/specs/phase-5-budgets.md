# Phase 5: decisions, budgets and remaining proposals

Decisions below were given by the user on 2026-10-09 (also in `docs/CHANGE-REQUESTS.md`, Resolved). Items marked PROPOSAL are not yet approved.

## Decisions (2026-10-09)
| ID | Decision |
|---|---|
| CR-A1 | Technical floor `minSdk` 26 (Android 8.0). Supported, tested and targeted: Android 12+ (API 31). Dynamic color on API 31+, seed fallback below. Ambiguity: the user's wording ("26 is fine, Android 12 and above is my target") could mean floor 26 or floor 31; recorded as floor 26 / target 31. The user can tighten the floor to 31 at any time (simplifies the color fallback and the Credential Manager paths). |
| CR-A2 | Ship arm64-v8a and armeabi-v7a (armhf). x86_64 is emulator/CI only, never shipped. |
| CR-A3 | Distribution: GitHub Releases (APK) for now. F-Droid-style repo and Play Store later/maybe. Signing-key management: still OPEN, see proposal below. |
| CR-A4 | Budgets and Android pass-rate target delegated to the agent; values below. Calibrate after first measurements; changes go through CHANGE-REQUESTS. |
| CR-A5 | Top-100 target 80%, plus mandatory categories (below). |
| CR-A6 | MV2 background pages MAY use a foreground service, with guardrails (below). |
| CR-A7 | Passkeys MUST work. Play services only if the spike proves they are required; otherwise avoided. Spike is Track C task 1 (below). |

## Signing key management (PROPOSAL, not decided)
- Release key generated and held offline by the user (hardware token or offline vault); never in the repo.
- CI builds unsigned artifacts by default. A separate protected workflow (`environment: release`, required reviewer, tag-only trigger) may sign with a key stored as a protected secret; preferably an upload/intermediate key with APK Signature Scheme v3 rotation so the offline root can rotate it.
- Publish SHA-256 of signing cert in release notes and `docs/`. No Play App Signing unless Play is adopted.
- Open question for the user: accept CI signing with a protected secret, or sign locally by hand?

## Budgets (agent-chosen, 2026-10-09; reference device = a mid-range arm64 Android 12+ phone, model recorded in each report)
| Metric | Budget | Measured by |
|---|---|---|
| Cold start to first paint (release) | <= 1.5 s and <= +15% vs same-version Chromium baseline with same flags | `tests/acceptance/phase-5/device-checks.sh install` |
| Idle RSS, 1 tab, uBO on | <= +60 MB vs no extensions | `dumpsys meminfo` |
| Idle wakeups, screen off, 1 h, uBO only, app backgrounded | <= 5 app wakeups/h above baseline | batterystats / `dumpsys alarm` |
| Battery, 30 min scripted browsing, uBO on vs off | uBO on <= +10% relative drain | Battery Historian |
| Page load median, ad-heavy set, uBO on | not slower than no-blocker by > 10% | blocker protocol |
| Foreground-service uptime | active only while a registered extension needs a persistent background page; see guardrails | notification log |
| Top-100 extension pass rate | >= 80% overall | `docs/ext-compat-android.md` |
| Idle network, 10 min, clean profile | 0 third-party connections | VPN/proxy capture |

### Mandatory extension categories (must pass, not merely counted in the 80%)
M-criteria addition: the build is not accepted if any of these fail on a physical device.
1. **New-tab override extensions**: a test extension and at least 2 popular real ones; picker, fallback, no flash (`ntp-extension-override`).
2. **Password managers**: at least 3 popular ones (autofill content scripts, popup, options, native-messaging-free flows); login and fill works on a test form.
3. **Ad blockers**: uBO (MV2, blocking webRequest) plus at least 2 others (one DNR-based MV3).
Protocol and cases: `tests/acceptance/phase-5/ext-compat-protocol.md`.

## Foreground-service guardrails (CR-A6)
- Use only while an enabled extension requires a persistent MV2 background page (or an active long-lived event such as a pending alarm window) and the app has no visible activity; otherwise let the process be reclaimed and restart on event.
- Always shows a user-visible ongoing notification (channel "Extensions running", low importance) naming the extensions that cause it; tapping opens the extensions manager.
- Per-extension opt-out ("Allow background keep-alive", default on for preinstalled uBO, default off for others pending measurement); global off switch.
- Android 14+ requires a declared foreground service type; choose and justify (`specialUse` with a documented subtype is the likely candidate: UNVERIFIED) and request POST_NOTIFICATIONS (API 33+).
- Subject to budgets above; if the idle-wakeup or battery budget fails, reduce keep-alive before shipping.

## Track C task 1: passkey spike (go/no-go)
Output: `docs/notes/android-passkey-spike.md` with a decision per API level band.
Questions: (a) does upstream Android WebAuthn in the pinned tree require Play services (FIDO2 / Credential Manager GMS bridge) to function, on a device without GMS (emulator image without Google APIs, plus a de-Googled device if available)? (b) API 34+: does platform `CredentialManager` work with no GMS for client and provider roles? (c) API 26-33: does the Jetpack Credential Manager client backport require Play services (believed yes for non-34; verify); if yes, what works without it (vault, hardware keys, hybrid)? 
Go/no-go: GO-no-GMS if passkeys register and sign in on webauthn.io without GMS for API >= 34 and via vault/hardware keys below. Only if that fails for a required scenario, adopt a Play-services path that is isolated behind a build flag and runtime setting (default off), implemented as a separate module, and documented in `docs/network-allowlist.md` terms (hosts/services contacted, why, how to disable). Never in the base build.

## Still-open items
Signing-key plan approval (above); CR-1, CR-2, CR-3.
