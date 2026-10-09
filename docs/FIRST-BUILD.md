# First complete build: plan and runbook

Decided 2026-10-09: scope = everything in Phase 1 (docs/specs/phase-1.md); builds and patch-writing happen on the user's PC with Claude Code running next to the Chromium checkout.

Why this is needed: the 19 patches in `patches/` are intent-only (no hunks), the C++ in `src-overlay/` has never been compiled, and the GN args have never been run through `gn gen`. All of that needs a real tree. The authoring sandbox cannot fetch or build Chromium.

## PC prerequisites
- Linux x86_64 (native or a VM with the disk and RAM below; WSL2 is possible but slow on disk), 64-bit.
- 32 GB RAM minimum, 64 GB recommended. 150 GB free SSD minimum, 300 GB comfortable. 8+ cores.
- git, python3, curl, Node 22+, Go 1.26+, and Claude Code installed and logged in.
- Case-sensitive local filesystem for the checkout (not a network mount, not inside this repo).

## Milestones (each ends with a committed report; do not skip ahead)
| # | Goal | Done when |
|---|---|---|
| M0 | Vanilla rebranded Chromium builds | `scripts/verify.sh --phase 0` passes (clean-build prints "Corvid") |
| M1 | Real GN args | `gn gen` succeeds for `linux-debug.gn`/`linux-release.gn`; wrong arg names fixed against `gn args --list`; pin in `scripts/CHROMIUM_VERSION` confirmed to exist |
| M2 | Overlay compiles | `overlay-tests` workflow / `scripts/ci-report.sh` green; unit tests run |
| M3 | Real patches (hunks) | each patch in `patches/series.phase*` has hunks generated with `scripts/refresh-patches.sh`, applies on fresh checkout, moves into `patches/series` |
| M4 | Phase 1 features working in the built browser | acceptance scripts in `tests/acceptance/phase-1/` stop SKIPping and pass |
| M5 | WebUI chrome shell + layout editor | tab strip, toolbar, address bar (top/bottom), side panel in a native window; layout persists |
| M6 | Packaging | `.deb`/`.rpm`/AppImage install on Debian/Ubuntu and Fedora |

M3 order (lowest rebase risk first, each one built and smoke-tested before the next):
1. `ui/0200` WebUI scheme + registry, `ui/0220` stock page blocking
2. `debrand/*` (metrics, variations, Safe Browsing, sync/signin, translate/spellcheck, component updater, network time/geo/DoH, WebRTC defaults)
3. `extensions/*` (MV2 allowed, blocking webRequest, preinstalled provider, newtab override), then pin uBlock Origin with `scripts/pin-ubo.sh`
4. `diagnostics/*`, `passkeys/*`
5. `ui/0210` native window hosting the WebUI chrome (M5)

After each group: run the idle network capture (`tests/acceptance/phase-1/`), because a rebase or a missed hook can reintroduce a Google endpoint.

## Setup on the PC
1. `git clone https://github.com/lucacraft89/corvid && cd corvid && git checkout claude/busy-rubin-t8bloc`
2. Follow `docs/build-host.md` ("Register your PC as the corvid-builder runner" and "Run this on your PC") for depot_tools, fetch and the first build. The first fetch is ~100 GB and the first build takes hours.
3. Start Claude Code in the repo root and paste the prompt below.

## Prompt to paste into Claude Code on the PC
```
Read AGENTS.md, docs/FIRST-BUILD.md, docs/ROADMAP.md, docs/specs/phase-1.md and docs/CHANGE-REQUESTS.md (Resolved table has my decisions). Work through milestones M0 to M6 in order. For M3 and M4 use one subagent per patch group, each in its own git worktree, and load skills/add-patch/SKILL.md. The Chromium checkout is at ~/chromium/src (never inside this repo). After every milestone: run scripts/verify.sh, write docs/reports/<milestone>-<date>.md with real command output (PASS/FAIL, never claim a pass you did not run), commit with small commits, and stop to ask me if you need a decision I have not recorded (licenses, privacy, anything irreversible). Do not change locked decisions in AGENTS.md. Push only to the branch I name.
```

## Decisions still open that can block specific milestones
- CR-11 Widevine legal basis: blocks distributing DRM-capable release builds, not local builds.
- CR-3/CR-10 codecs and CR-4 name: block public release only.
- Android signing key plan: blocks Phase 5 release only.
