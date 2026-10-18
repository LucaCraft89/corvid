# Corvid status (keep this current; update at every milestone/group)

Branch: `claude/busy-rubin-t8bloc`. Chromium pin: see `scripts/CHROMIUM_VERSION`. Scope of first build: all of Phase 1 (decided 2026-10-09). macOS dropped.

| Milestone | State |
|---|---|
| M0 vanilla rebranded build | DONE (acceptance 5, CI on GitHub, still SKIPPED: needs runner + 2 test PRs) |
| M1 real GN args | DONE (Safe Browsing / service discovery cannot be compiled out; G2 must neutralise) |
| M2 overlay compiles | DONE (53/53 gtests) |
| M3 G1 UI plumbing | DONE (acceptance 02: 111 pass) |
| M3 G2 de-Google | IN PROGRESS: patches 0100-0197 written and built on the PC; idle capture 0 connections (0196); binary host check waits on the out/GnDebug build (scoped rules A/B/C approved 2026-10-12); in-code host groups D/E untriaged; G2 report not yet written |
| M3 G3 extensions + uBO | todo |
| M3 G4 diagnostics + passkeys | todo (also vendor Argon2 Apache-2.0 for the C++ vault) |
| M3 G5 branding | todo |
| M4 Phase 1 features in browser | todo |
| M5 WebUI chrome shell | todo (riskiest; ask before choosing approach) |
| M6 packaging | todo |

Open decisions that need the user: see `docs/CHANGE-REQUESTS.md` (CR-11 Widevine legal, CR-3/CR-10 codecs legal, CR-4 name, Android signing key plan).
Decisions already made are in the Resolved table there.

Remaining steps to the end of Phase 1 and what each waits on: `docs/notes/path-to-end.md` (2026-10-13).

Plan of record (2026-10-13, Luca): target Thursday 2026-10-15 is Corvid 0.1 without custom chrome (G2-G5, M4 checks, M6 packaging). M5 chrome shell is research only for now. Schedule and per-day list: `docs/notes/path-to-end.md`. Design draft: `docs/DESIGN.md`.
