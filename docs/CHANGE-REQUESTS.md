# Change requests and open decisions

Agents: propose changes to locked decisions here; do not act on them until the user approves. Record the date and outcome.

## Open items (need the user's answer before the relevant phase)
| ID | Item | Needed by | Status |
|---|---|---|---|
| CR-1 | uBlock Origin is GPL-3.0; confirm bundling it unmodified as a separate extension alongside a BSD-3 browser | Phase 1.10 | open |
| CR-2 | Extension store source: Chrome Web Store use from a non-Chrome browser has terms-of-service implications; choose default/configurable sources | Phase 1.7 | open |
| CR-3 | Proprietary codecs in distributed builds (legal) | Phase 1.13 | open |
| CR-4 | Name "Corvid": trademark/domain check before any public release | before first release | open |
| CR-5 | Hybrid passkey transport requires a tunnel server host; decide policy | Phase 2.7 | open |
| CR-6 | Top-100 extension pass-rate target (proposed 85%) | Phase 1.12 | open |

## Resolved
| Date | Decision |
|---|---|
| 2026-10-09 | Gecko/Firefox dual-engine dropped; Chromium only |
| 2026-10-09 | Phase 5 CR-A1: minSdk 26 floor, supported/target Android 12+ (API 31), dynamic color 31+, seed fallback below; user may tighten floor to 31 (wording ambiguous) |
| 2026-10-09 | Phase 5 CR-A2: ship arm64 + armhf; x86_64 emulator-only |
| 2026-10-09 | Phase 5 CR-A3: distribute via GitHub Releases APK now; F-Droid-style repo and Play later/maybe; signing-key plan still open (proposal in docs/specs/phase-5-budgets.md) |
| 2026-10-09 | Phase 5 CR-A4/A5: budgets and 80% Android top-100 target delegated to agent (docs/specs/phase-5-budgets.md); new-tab overrides, password managers, ad blockers are mandatory pass categories |
| 2026-10-09 | Phase 5 CR-A6: MV2 background pages may use a foreground service with guardrails |
| 2026-10-09 | Phase 5 CR-A7: passkeys must work; Play services only if the Track C spike proves required, isolated and optional |
