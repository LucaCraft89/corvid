# Corvid: full plan for the first real run (for Claude Code on the user's PC)

You are Claude Code running on the user's Linux PC, next to a real Chromium checkout. Everything in this repo so far was written in a sandbox that could not fetch or build Chromium, so every C++ file, GN arg, patch sketch and Chromium symbol name is UNVERIFIED and partly recalled from memory. Your job: turn this repo into a Corvid build that passes the Phase 1 acceptance suite (`docs/specs/phase-1.md`).

Read first, in order: `AGENTS.md` (locked decisions), `docs/FIRST-BUILD.md`, `docs/ROADMAP.md`, `docs/specs/phase-1.md`, `docs/CHANGE-REQUESTS.md` (the Resolved table holds the user's decisions), `docs/build-host.md`, `docs/PATCH-PROVENANCE.md`, `docs/reports/phase-1-linux-*.md`. Load a skill from `skills/` only when its task comes up.

## Ground rules
1. Never claim a pass you did not run. Every report row is PASS (with command + output excerpt), FAIL (with output), or SKIPPED (with reason). Do not weaken or delete a test to get green; if a test is wrong, fix it in a separate commit with an explanation.
2. The Chromium checkout lives at `~/chromium/src` (`export CORVID_SRC=$HOME/chromium/src`), never inside this repo. The repo stores patches, overlay, scripts, UI. Never commit a modified Chromium tree.
3. Smallest possible patches, one concern each, with the header from `skills/add-patch/SKILL.md`. Prefer `src-overlay/` over editing upstream files. Patches are generated with `scripts/refresh-patches.sh`, never hand-edited hunks.
4. Verify every Chromium symbol, path and GN arg against the real tree before using it (`rg`, `gn args --list`, code search). Record findings in `docs/notes/` so they are not re-derived.
5. Ask the user (stop and wait) before: changing a locked decision; adding a dependency whose license is not BSD/MIT/Apache; anything touching privacy/telemetry beyond the recorded decisions; anything irreversible; spending beyond the local machine (cloud, paid services); publishing, pushing tags or opening PRs. Never store keys or credentials in the repo.
6. Commit small and often; trailer on every commit:
   `Co-Authored-By: Claude <noreply@anthropic.com>`. Push only to the branch the user names (default `claude/busy-rubin-t8bloc`).
7. Protect the machine: long builds in the background with logs under `~/corvid-logs/`; if RAM is tight use `CORVID_JOBS`; use sccache if installed; check `df -h` before each big step and stop if free space < 40 GB.
8. Privacy is a hard gate: after every patch group run the idle network capture; any connection not in `docs/network-allowlist.md` is a FAIL.

## Preflight (before M0)
- `nproc`, `free -g`, `df -h ~`, `git --version`, `python3 --version`, `node --version` (22+), `go version` (1.26+), `npm ci && npm run check` in the repo (must pass: this is the portable baseline), `scripts/overlay-selfcheck.sh`.
- Write `docs/reports/preflight-<date>.md` with the machine specs and results. Stop and tell the user if RAM < 32 GB or free disk < 150 GB.

## M0: vanilla rebranded Chromium (Phase 0 acceptance)
1. `scripts/fetch.sh` (depot_tools + pinned tag). If the tag in `scripts/CHROMIUM_VERSION` does not exist, STOP and report; propose the newest real stable tag (check https://chromiumdash.appspot.com or `git ls-remote --tags https://chromium.googlesource.com/chromium/src.git`) and wait for approval before changing the pin. Also pin depot_tools: write the revision you actually used to `scripts/DEPOT_TOOLS_REV`.
2. `( cd $CORVID_SRC && build/install-build-deps.sh )` once (needs sudo; ask if sudo is unavailable).
3. `CORVID_ALLOW_BUILD=1 scripts/verify.sh --phase 0 --platform linux`. Fix script bugs as needed (they were only tested against a fixture repo). Acceptance: clean-build prints a version string containing "Corvid", idempotent apply, rename test, rebase dry-run.
4. Fill the measured numbers (fetch time, full build time, incremental build time, disk used) into `docs/build-host.md`.
5. Report: `docs/reports/M0-<date>.md`. Commit.

## M1: real GN args
1. `gn gen out/Debug --args="$(grep -v '^#' build/args/linux-debug.gn)"` (use the repo's own method in `scripts/build.sh`). Fix every unknown/renamed/removed arg against `gn args out/Debug --list`. Remove args that no longer exist; do not silently drop an intent (codecs, hw accel, Google-service-off, Widevine glue): if an arg is gone, find its replacement and note it in `docs/notes/gn-args.md`.
2. Repeat for `linux-release.gn` (`gn gen` only; a release build can wait until M6).
3. Check the intent holds in the built binary: `ffmpeg_branding`/proprietary codecs, VA-API present, Wayland and X11 ozone, no `google_api_key`.
4. Report `M1`. Commit.

## M2: overlay compiles
1. Wire `src-overlay/` into the tree the way `scripts/apply-patches.sh` does, add the minimal hook for `//corvid:corvid_phase1_unittests` (GN target in the real tree), build it.
2. Fix compile errors in `src-overlay/corvid/{chrome_shell,modules,theme,webui,diagnostics,passkeys,sync}` file by file, in dependency order. Replace every recalled Chromium API with the real one. Run the unit tests; fix failures. Keep the 23 stand-in logic tests in `scripts/overlay-selfcheck.sh` passing or update them in step.
3. Make `.github/workflows/overlay-tests.yml` and `scripts/ci-report.sh` work on the runner, if the user registered it (optional now).
4. Report `M2`. Commit.

## M3: real patches (use subagents)
Spawn one subagent per group, each in its own git worktree of this repo AND its own checkout approach: do NOT run several builds against the same `out/` dir at once. Run groups sequentially for building, but parallelise research and patch authoring if the machine allows. Each subagent loads `skills/add-patch/SKILL.md`, edits the real tree, runs `scripts/refresh-patches.sh`, proves the series applies on a fresh checkout state, builds, and smoke-tests. Order:

| Group | Patches | Skills | Gate before next group |
|---|---|---|---|
| G1 UI plumbing | `ui/0200` corvid:// scheme + registry, `ui/0220` block/redirect stock webui | add-webui-page | every URL in `docs/stock-pages.md` shows a Corvid page, redirect or blocked page |
| G2 de-Google | `debrand/0100` to `0170` | debrand-and-degoogle | 15 min idle network capture clean (acceptance 01), binary host grep clean (01b) |
| G3 extensions | `extensions/0300` MV2 allowed, `0310` blocking webRequest, `0320` preinstalled provider, `0330` newtab override; run `scripts/pin-ubo.sh` | mv2-maintenance, preinstall-extension, ntp-extension-override | acceptance 06, 07, 08 pass; MV2+MV3 test extensions survive restart |
| G4 diagnostics + passkeys | `diagnostics/2001,2002`, `passkeys/2003,2004` | diagnostics-event, devtools-extension, passkey-authenticator | Phase 2 acceptance items that need a browser (hang within 5 s, error pages, vault) |
| G5 branding | icons, strings, desktop file via `branding/config.toml` | debrand-and-degoogle | rename test passes with real tree |

After each group: move its patches from `patches/series.phaseN` into `patches/series`, run `scripts/verify.sh --phase 0` (regression), the relevant `tests/acceptance/phase-1/` scripts, and `docs/reports/M3-G<n>-<date>.md`.

Patch rules that matter here: MV2 gates (`docs/notes/mv2-gates.md`) must be located in the real tree, not assumed; the Google "enclave" passkey authenticator is gated off, not deleted; Widevine is user-initiated only (CR-11) so keep `bundle_widevine_cdm=false`.

## M4: Phase 1 features in the built browser
Make the `tests/acceptance/phase-1/` scripts stop SKIPping and pass, one by one: 01 no phone-home, 02 no stock screens, 03 layout, 04 modules, 05 theme (GNOME portal + KDE live recolor within 1 s), 06 extensions, 07 uBO, 08 new tab, 09 compat (top-100 list recorded; target 85%, extension sources: Chrome Web Store, Edge Add-ons, custom store URL, manual CRX/ZIP/unpacked), 11 hardware acceleration (`vainfo`, GPU raster, WebGL/WebGPU), 12 WebRTC (calls work, default IP policy protective, no hardcoded Google STUN). Fix the product, never the test. Record results in `docs/reports/phase-1-linux-<date>.md` and `docs/ext-compat.md`.

## M5: WebUI chrome shell and layout editor
Biggest risk; do it only after M4 is green. Scope: tab strip, toolbar, address bar, side panel host in a native window (`ui/0210`), default layout `desktop-vertical-tabs`, other presets selectable, address bar movable to top or bottom (`addressbar.position`, see `docs/notes/addressbar-position.md`), edit mode with drag and drop, layouts saved as JSON, "Reset layout" always reachable, required components cannot be removed. First investigate what Chromium already offers (WebUI tab strip, `//chrome/browser/ui/webui/tab_strip`, side panel, Views-hosted WebUI) and reuse it before writing new C++; write the findings and a chosen approach to `docs/notes/chrome-shell-approach.md` and ASK the user before committing to a large approach. Acceptance 03 and 04 must pass on the real shell. If this exceeds reasonable effort, stop and report: a "Corvid 0.1 without custom chrome" release (M0-M4 + M6) is an acceptable fallback, but only the user can decide to cut scope.

## M6: packaging and Phase 1 close-out
`scripts/package.sh linux` for `.deb`, `.rpm`, AppImage/tarball; install and launch in Debian/Ubuntu and Fedora VMs on X11 and Wayland if available (acceptance 10; otherwise mark SKIPPED honestly). Run the whole Phase 1 suite via `scripts/verify.sh --phase 1 --platform linux` and write the final report. Do not mark Phase 1 complete on partial passes.

## When something fails
- Build error: read the first real error, fix root cause; do not stack workarounds. If a fix needs a larger patch than planned, say so in the report and keep the patch minimal.
- Chromium symbol gone/renamed: grep the tree and `git log -S` upstream history; adapt the intent, update `docs/notes/`.
- Flaky or slow tests: rerun once to confirm; a second failure is real.
- Stuck for more than two attempts on the same problem: write what you tried and stop to ask the user.

## Reporting format (every milestone)
`docs/reports/<milestone>-<date>.md`: goal, commands run, result table (PASS/FAIL/SKIPPED with evidence), patches added/changed, new notes written, open questions for the user, next milestone. End each milestone by telling the user in 5 lines what passed, what failed, and what you need from them.

## Things only the user can decide (ask when reached, do not guess)
Pin bump to another Chromium tag; sudo/package installs; Widevine route (CR-11); public release gating (codecs CR-3/CR-10, name CR-4, signing); scope cut for M5; any new non-BSD/MIT/Apache dependency; pushing anywhere except the named branch.
