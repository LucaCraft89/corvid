# Orchestrator resume note (2026-10-10 ~15:40)

Local Claude session ran one subagent per milestone. Resume with: read this, then docs/reports/M*-*.md, then `git log --oneline | head`.

## State
- M0, M1, M2: done, accepted by user, pushed (docs/reports/M0/M1/M2-2026-10-10.md).
- M3 (real patches) running as ONE background subagent (id a434cabc7da8d4905) in G1..G5 order. G1 done and pushed (docs/reports/M3-G1-2026-10-10.md). G2 (debrand 0100-0170) built, uncommitted in the working tree, running 15-min idle network capture + verify. Then G3 extensions+uBO, G4 diagnostics+passkeys, G5 branding.
- After M3: M4 (acceptance scripts phase-1 stop SKIPping), M5 (WebUI chrome shell, ASK user before big approach), M6 (packaging). One agent per milestone, sequential (shared Chromium tree).

## Decisions from user (beyond docs/CHANGE-REQUESTS.md)
- Vault KDF: vendor reference Argon2 (Apache-2.0 side of CC0/Apache-2.0) under third_party/ + BUILD.gn, record in PATCH-PROVENANCE.md; verify license text, stop and ask if anything else. Keep Argon2id.
- EventBus/StackSampler built in G4.
- 5-line summary after each group (top of each docs/reports/M3-G<n>-*.md).
- Push only to claude/busy-rubin-t8bloc (git fetch + merge first). git user.email = luca07h2o@gmail.com.
- Acceptance 5 (CI on GitHub) of Phase 0 is SKIPPED, user must do the GitHub steps in the M0 report.
- Cloud session "One agent per step/phase" can be messaged one-way (SendMessage by name); it cannot reply except via files committed to the branch (docs/notes/cloud-handoff.md).

## Host facts
- Fedora 44, Ryzen 9 7900X 24 threads, 32 GB RAM, RTX 4070. User away: use whole machine, CORVID_JOBS=20.
- Builds run in Ubuntu distrobox `corvid-build` (CORVID_BUILD_CONTAINER); tree ~/chromium/src, builds out/Debug (M0 vanilla), out/GnDebug (working). sccache at ~/sccache.
- After reboot: `sudo swapon -p 10 /home/swap/swapfile` (not in fstab). Sudo password is NOT in the repo; ask user.
- Never run two builds on one out dir. Check RAM/disk first.

## Scheduled check
Session-only hourly stuck-check cron; recreate if session restarts (agent stuck = transcript unchanged >40 min and no siso/autoninja).
