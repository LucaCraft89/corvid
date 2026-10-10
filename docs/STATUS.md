# Corvid status (keep this current; update at every milestone/group)

Branch: `claude/busy-rubin-t8bloc`. Chromium pin: see `scripts/CHROMIUM_VERSION`. Scope of first build: all of Phase 1 (decided 2026-10-09). macOS dropped.

| Milestone | State |
|---|---|
| M0 vanilla rebranded build | DONE (acceptance 5, CI on GitHub, still SKIPPED: needs runner + 2 test PRs) |
| M1 real GN args | DONE (Safe Browsing / service discovery cannot be compiled out; G2 must neutralise) |
| M2 overlay compiles | DONE (53/53 gtests) |
| M3 G1 UI plumbing | DONE (acceptance 02: 111 pass) |
| M3 G2 de-Google | NEXT (baseline idle capture: 27 hosts) |
| M3 G3 extensions + uBO | todo |
| M3 G4 diagnostics + passkeys | todo (also vendor Argon2 Apache-2.0 for the C++ vault) |
| M3 G5 branding | todo |
| M4 Phase 1 features in browser | todo |
| M5 WebUI chrome shell | todo (riskiest; ask before choosing approach) |
| M6 packaging | todo |

Open decisions that need the user: see `docs/CHANGE-REQUESTS.md` (CR-11 Widevine legal, CR-3/CR-10 codecs legal, CR-4 name, Android signing key plan).
Decisions already made are in the Resolved table there.
