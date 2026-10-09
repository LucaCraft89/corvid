---
name: rebase-chromium
description: Move Corvid to a newer Chromium stable version and fix patch conflicts. Use for each Chromium stable bump (target weekly check, rebase on stable releases).
---

# rebase-chromium

## Steps
1. `scripts/rebase.sh <new-tag>`: bumps `scripts/CHROMIUM_VERSION`, fetches, applies the series on a scratch branch, and writes `docs/rebase/<tag>.md` with per-patch status (clean / fuzz / conflict).
2. Resolve conflicts one patch at a time, in series order. For each: read upstream's change to that file (`git log -p <old>..<new> -- <file>` limited to the touched hunks), re-apply intent, then `scripts/refresh-patches.sh`.
3. If a patch's intent is now upstream, delete it and note that in `docs/PATCH-PROVENANCE.md`.
4. Watch MV2 and extension-system patches first; these conflict most. Cross-check with `mv2-maintenance`.
5. Rebuild Linux, run `verify-phase` for the current phase, then (if applicable) Windows and Android builds.
6. Commit as one change: new pin + refreshed patches + rebase report.

## Done when
- Series applies clean, build passes, current-phase acceptance checks pass, rebase report committed.

## Pitfalls
- Do not rebase across Chromium milestone jumps without checking security-fix notes; prefer the latest stable.
- Keep a list of patches by rebase risk (`docs/rebase/risk.md`) and shrink the riskiest ones into `src-overlay/` where possible.
