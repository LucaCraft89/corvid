# Path to the end of Phase 1 Linux (written 2026-10-13, from the repo state at 48deab2)

Ordered list of what remains, and what each step waits on. "No tree" means it cannot be done in a sandbox without the Chromium checkout. Nothing here is a test result.

| # | Step | Waits on | Owner |
|---|---|---|---|
| 1 | Finish `out/GnDebug` product-args build (cache-assisted) | VM build, about 7 h from 2026-10-13 morning | VM builder |
| 2 | Host check (`01b`, using `host-gate.tar` against out/GnDebug, not out/Shared) with the scoped rules A/B/C | step 1 | Azure builder |
| 3 | 15-minute idle capture on out/GnDebug (acceptance 01), including 0197 which was never captured | step 1 | VM or PC |
| 4 | Triage groups D/E (about 22 unlisted in-code hosts): trace each, patch live endpoints, or ask Luca to allow identifiers | step 2 | Azure builder |
| 5 | Write `docs/reports/M3-G2-<date>.md` (referenced by degoogle.md, but absent from the repo) and flip degoogle items 6, 13, 14, 16, 20, 21 | steps 2-4 | G2 owner |
| 6 | G3 patches 0300 to 0330 (MV2, blocking webRequest, preinstalled provider, NTP override) are intent-only; need real hunks against the tree, then `scripts/pin-ubo.sh` | No tree here; PC or VM with the checkout. Authoring can overlap step 1 only if it does not touch out/GnDebug | patch-author on PC |
| 7 | G3 gate: acceptance 06, 07, 08 pass; MV2+MV3 test extensions survive restart | step 6 plus a build | PC |
| 8 | G4 diagnostics + passkeys (2001-2004, vendor Argon2 Apache-2.0 under third_party) | step 7 | PC |
| 9 | G5 branding (icons, strings, desktop file) and rename test on the real tree | step 8 | PC |
| 10 | M4: acceptance 01-12 stop SKIPping (03/04 layout and modules need M5 shell; 05 theme; 09 compat; 11 hw accel; 12 WebRTC) | steps 5-9 | PC |
| 11 | M5 WebUI chrome shell. Investigate existing Chromium options first, write `docs/notes/chrome-shell-approach.md`, ASK Luca before choosing | M4 green; docs/DESIGN.md written after M4 and before M5 (Luca, 2026-10-12) | PC |
| 12 | M6 packaging (.deb, .rpm, AppImage), install tests on Debian/Ubuntu and Fedora, X11 and Wayland, full `verify.sh --phase 1` | M5 | PC and VM |

## Decisions that only Luca can make (not blocking until reached)
- Before G3 ships: CR-2 (extension store legal) and CR-1 (uBO licence) are referenced as open in docs/notes/android-ext-baseline.md; confirm status in CHANGE-REQUESTS.md.
- Before M5: approach for the chrome shell, and whether to cut scope to "0.1 without custom chrome".
- Before first release: CR-4 (name), CR-10, CR-3 (codecs), CR-11 (Widevine).
- Any allowlist addition for groups D/E needs Luca's own words in the thread.

## Parallelism
Only one ninja per machine and one per out dir. While the VM builds out/GnDebug, the PC (idle) can build G3 in its own copy of the cache-compatible config, but its G3 patches change the source tree, so cache hits for the shared out/GnDebug need identical source on both machines. Recommendation: author G3 hunks on the PC now, and apply them to the VM tree only after the step 2-3 gates run, so the host check and idle capture measure G1+G2 as intended.
