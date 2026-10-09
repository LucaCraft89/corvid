# Phase 5 (Android) report, 2026-10-09

Environment: sandbox without Chromium checkout, Android SDK, device or emulator. Phase 5 is NOT complete. Nothing was built.
Legend: PASS (ran here), UNVERIFIED (written, never run on device/build), BLOCKED (needs user decision).

## Acceptance (docs/specs/phase-5.md)
| # | Check | Status | Evidence / next step |
|---|---|---|---|
| 1 | Debug+release install on Android 12+ device and emulator; launch/memory | UNVERIFIED | GN args and CI written (`build/args/android-*.gn`, `.github/workflows/android.yml`); `device-checks.sh install` is a stub. Needs Phase 0 pin + build host. |
| 2 | Dynamic color + <12 seed fallback | UNVERIFIED | Design + Kotlin + TS in `theme/providers/android/`; not compiled. |
| 3 | Layout one-handed, persist, reset | UNVERIFIED | `ui/layout/presets/mobile.json` structural self-check PASS (`validate-layout.py`); schema validation SKIPPED because `ui/layout/layout.schema.json` is absent in this base. Device reachability unverified. |
| 4 | Extensions M1-M5, uBO, budgets | UNVERIFIED | Research + plan in `docs/notes/android-ext-baseline.md`; API table skeleton `docs/ext-api-android.md`; budgets are proposals only. Compat table not started. |
| 5 | Passkeys (Credential Manager + vault) | UNVERIFIED | Design + skeleton in `src-overlay/corvid/android/credential/`. Major open risk: GMS dependency of upstream Android WebAuthn. |
| 6 | Idle network capture on device | UNVERIFIED | Stub only. |
| 7 | Tablet/foldable | UNVERIFIED | Breakpoints in preset only. |

## Static checks run here
- `validate-layout.py`: structural PASS, schema SKIPPED (missing).
- `check-patch-headers.py`: ok (0 patches; `patches/series.phase5` is intentionally empty, groups listed as comments).
- Workflow YAML parses.

## Research caveat
`chromium.googlesource.com` was unreachable via the fetch tool. Upstream findings (ENABLE_EXTENSIONS_CORE, desktop Android is MV3-only,
experimental) come from web-search excerpts of Chromium docs/commits and press; must be re-verified on the pinned tree (commands in the baseline note).

## Key findings
1. Upstream has a gradual "desktop Android" extensions port keyed on `ENABLE_EXTENSIONS_CORE`; reuse it. It is MV3-only, so Corvid's MV2 requirement (uBO) is the largest carried delta.
2. Upstream Android WebAuthn likely depends on Google Play services: conflicts with zero-Google; needs a spike (CR-A7).

## Questions for the user (defaults proposed in `docs/specs/phase-5-budgets.md`)
CR-A1 min Android (proposed API 26); CR-A2 ABIs (arm64 + x86_64 emulator); CR-A3 distribution/signing (sideload + F-Droid-style, no CI signing);
CR-A4 budgets; CR-A5 Android top-100 target (80%); CR-A6 foreground service for MV2 background pages; CR-A7 passkeys without Play services.
Also existing: CR-1 (uBO licence), CR-2 (extension store source), CR-3 (codecs).

## Not in my paths but noted
`.github/workflows/android.yml` was requested explicitly; assumes Phase 0 scripts (`scripts/fetch.sh`, `scripts/apply-patches.sh`) whose interfaces are unknown.
Phase 5 per ROADMAP should not start until Phases 0-4 pass; this work is design/scaffolding only.
