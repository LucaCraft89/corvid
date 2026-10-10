# Corvid: Claude Code project guide

@AGENTS.md

Read `docs/STATUS.md` first for where the work stands, then `docs/CLAUDE-CODE-PLAN.md` for the milestone plan. Skills live in `skills/` (also exposed at `.claude/skills`); load one only when its task comes up.

## Environment facts (the maintainer's PC; override with env vars if they differ)
- Host Fedora; Chromium builds run inside the Ubuntu distrobox `corvid-build` (set `CORVID_BUILD_CONTAINER`). `install-build-deps.sh` does not support Fedora.
- Chromium checkout: `CORVID_SRC=$HOME/chromium/src` (never inside this repo). Pin: `scripts/CHROMIUM_VERSION`.
- RAM is 32 GB: `CORVID_JOBS=16..20` at most, swap on, `sccache` installed. Check `free -g` and `df -h` before big steps.
- Build output dirs: `out/GnDebug` (product args from `build/args/linux-debug.gn`), `out/Debug` (M0 baseline).
- Git identity for commits: `luca07h2o@gmail.com`. Set it before committing. Push only to `claude/busy-rubin-t8bloc`; never force-push, never rewrite pushed history, never open PRs unless asked.

## Rules that matter most
1. Never claim a pass you did not run. Reports use PASS (command + output), FAIL, or SKIPPED (reason). Do not weaken a test to get green; if a test is wrong fix it in its own commit with an explanation.
2. Verify every Chromium symbol, path and GN arg against the real tree; write findings to `docs/notes/`.
3. Privacy is a hard gate: the idle network capture must show zero connections outside `docs/network-allowlist.md`; never add a host to that file without asking.
4. Ask the user before: changing a locked decision, a pin bump, adding a dependency that is not BSD/MIT/Apache (Apache side of a dual license is fine, record it), sudo installs, anything irreversible, spending money, publishing.
5. After every milestone or patch group: write `docs/reports/<id>-<date>.md`, update `docs/STATUS.md`, commit, push, and give the user a 5-line summary (passed, failed, needs from you).

## Handy commands
`/status`, `/verify`, `/milestone-report`, `/patch-group <G1..G5>`, `/idle-capture`. Subagents: `patch-author`, `chromium-researcher`.
Quick checks: `npm run check` (portable), `scripts/overlay-selfcheck.sh`, `scripts/verify.sh --phase 0 --platform linux`, `scripts/overlay-tests.sh`.
