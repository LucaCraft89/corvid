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

---

# Schedule to Thursday 2026-10-15 (written 2026-10-13 10:05 UTC; estimates, not measurements)

Goal (Luca, 2026-10-13): first complete build with all features in `docs/CLAUDE-CODE-PLAN.md` (M3 G2-G5, M4, M5, M6) by Thursday. Builders: Azure VM (4 cores) and Luca's 16 vCPU VM; the PC is out.

## Build-time model
Measured on the PC (20 jobs, cold cache): full debug `chrome` about 70 min; incremental after touching one browser file 68 s (`docs/build-host.md`). The 4-core VM is about 3x slower than the PC per the project notes, and a cold full build there is quoted at about 15 h (`tests/phase-0/clean-build.sh`). Assumptions, all unmeasured: the 16 vCPU VM does a cold full build in about 3 to 4 h; with a warm sccache (Azure Blob) a build that changes a few patches recompiles only dependents, so 20 to 90 min on 16 vCPU, 1 to 4 h on 4 cores. A patch touching a widely included header can force several hours. Measure the 16 vCPU VM's first build and replace these numbers.

## Critical path (serial, needs a build each)
| When (UTC, optimistic) | Step | Machine | Est. |
|---|---|---|---|
| Tue 10-13 to about 17:00 | out/GnDebug finishes (G1+G2) | 4-core VM | about 7 h left (coordinator's figure) |
| Tue evening | host check 01b + idle capture (repeat with 0197) | 4-core VM | 1 h + 15 min capture |
| Tue evening | triage groups D/E, patches for live endpoints | Azure thread (no build) | 2 to 3 h writing |
| Wed morning | G2 gate closed; G2 report | any | 1 h |
| Wed | G3 build + acceptance 06/07/08 | 16 vCPU VM | patches ready, build 1 to 3 h, test 1 to 2 h |
| Wed night | G4 (diagnostics, passkeys, Argon2) build + gtests | 16 vCPU VM | 2 to 4 h |
| Thu morning | G5 branding + rename test | 16 vCPU VM | 1 to 2 h (rename test needs a clean pass; avoid the 15 h clean-build, use CORVID_REUSE_BUILD=1) |
| Thu | M4 acceptance sweep (01-12) | 16 vCPU VM | 3 to 5 h, includes fixing failures |
| After Thu | M5 shell, M6 packaging | | see below |

## Parallel lanes (no build needed, start now)
- Cloud thread sessions: write G3 hunks (0300 to 0330) and G4 hunks (2001 to 2004, Argon2 vendoring) as patches against a Chromium tree. They need the checkout to get real hunks, so a session with a tree (a VM, using a separate worktree or copy, never the build tree) must do the editing; the cloud sessions can write the C++/TS overlay, tests and docs. Keep them on a separate branch until the G2 checks finish (Luca/coordinator decision).
- Overlay and UI work in `src-overlay/` and `ui/` (layout engine, modules, theme, settings pages) compiles into the same tree, so it only needs the next build, not a dedicated one. Batch it with G3/G4 builds.
- `docs/DESIGN.md` can be written now (cloud, no build) instead of after M4.
- Azure builder: host triage and storage; it must not start a second ninja on the 4-core VM.
- One ninja per machine, one per out dir. Both VMs share the cache; identical source and GN args (use_clang_modules=false) are required for hits.

## Honest call
- Fits by Thursday with luck: G2 closed, G3, G4, G5 built, and a partial M4 sweep. Each assumes the first G3/G4 patches compile without a bad week of fixes; the history here (G2 took days, test failures after builds) says expect at least one rebuild per group.
- Will not fit: M5 (WebUI chrome shell). It is the plan's riskiest item, needs a research note and Luca's approval of an approach before coding, then multiple full builds; days, not hours. M6 (packaging plus install tests on Debian/Ubuntu/Fedora VMs, X11 and Wayland) also does not fit, and clean-build acceptance alone is about 15 h on 4 cores.
- Phases 2 to 5 of the roadmap (Windows, sync server, Android) are not in the plan file's scope and cannot fit.

## Scope-cut options for Luca
1. **Thursday = "Corvid 0.1 without custom chrome"**: G2-G5 + M4 + M6 packaging, stock-looking Views chrome with Corvid internal pages. The plan itself names this as the acceptable fallback; only Luca can choose it. Most likely to land by Thursday or Friday.
2. **Thursday = G2-G4 verified, G5 and M4 sweep following Friday-Saturday**, M5 started after. Lowest risk of a bad rushed build, but no complete build on Thursday.
3. **Keep full scope, move the date**: realistic estimate is the following week or longer, driven by M5.
Recommendation: option 1, with M5 started in parallel as research on the cloud sessions (approach note first).

## Risks to the schedule
- 4-core VM is the slow path; move everything but the in-flight GnDebug build to the 16 vCPU VM.
- A bad cache config (modules, args mismatch) turns a 1 h build into 15 h. Check cache hit rate in the first build log.
- Rebuilds after test failures (the item 17 pattern) are not in the estimates above.
