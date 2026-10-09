# Phase 0 report: Linux, 2026-10-09

**Phase 0 is NOT complete.** Everything that needs a real Chromium checkout or build is written but UNVERIFIED. Passing results below come from a tiny fake repository (fixture), which proves the tooling logic only and says nothing about Chromium.

## Verified locally (fixture mode, `scripts/verify.sh --phase 0 --platform linux --fixture`)

Run in the authoring sandbox (no Chromium, no build host). Fixture: a small git repo with tags `100.0.0.1`/`100.0.0.2`, three fixture patches, an overlay file, and a stub `BRANDING`.

| Check | Result | What it actually proves |
|---|---|---|
| `lint.sh` | PASS | 16 shell files pass `bash -n` and `shellcheck -S style`; `render-branding.py` compiles |
| `idempotent-apply.sh` | PASS | Applying twice (and a third time after planting a stale file) gives an identical tree fingerprint; no `.rej`/`.orig`; patch, overlay and rendered branding content present |
| `rename.sh` | PASS | Baseline render with `Corvid` leaves 3 offending paths (so the grep is not vacuous); after rendering a config named `Zebrafish` there are zero `corvid` hits (content or file names) outside `CREDITS`/`AUTHORS` |
| `rebase-dry-run.sh` | PASS | `rebase.sh 100.0.0.2` exits 2, writes the report with `clean`/`conflict`/`fuzz` per patch (offset-only patch = clean, changed line = conflict, changed outer context = fuzz); real pin file untouched |
| `ci-patch-gate.sh` | PASS | `verify.sh --patch-check` is green on valid patches, red on a non-applying patch (names it), red on a missing header field, red on an orphan patch file |
| `refresh-roundtrip.sh` | PASS | `refresh-patches.sh` is a no-op on an untouched tree, registers a new `corvid-new:` commit as `ui/0004-foo-extra.patch` in series, and the regenerated series re-applies to identical content |
| `clean-build.sh` | SKIP | Fixture cannot test it |

`verify.sh` exit code 3 means "no failures but something skipped": the phase must not be marked done.

Also executed: `render-branding.py` against a stub tree; YAML of all three workflows parses (`yaml.safe_load`).

## UNVERIFIED (written, never run)

1. `scripts/fetch.sh` full mode (depot_tools, `fetch chromium`, `gclient sync`) and patch-only (sparse partial clone) mode.
2. `scripts/build.sh`: gn args, autoninja, `--version` containing `Corvid`, headless launch. Whether `chrome --version` shows the branded name via `BRANDING` alone is an assumption; a small patch may be needed.
3. `tests/acceptance/phase-0/clean-build.sh` (acceptance 1) and the real-tree modes of `idempotent-apply.sh`, `rename.sh`, `rebase-dry-run.sh` (acceptance 2, 3, 4 on real Chromium). Real-mode run here: 1 pass (lint), 6 skip, because no checkout exists.
4. Acceptance 5 on GitHub: the three workflows in `.github/workflows/` have never executed. Green on a trivial patch PR and red on a broken one is unproven (only the underlying `--patch-check` gate is tested locally).
5. Branding templates (`BRANDING` keys, `chrome/app/brand/*`) are written from memory of the Chromium layout and not checked against the pinned tree; nothing in Chromium consumes `chrome/app/brand/*` yet.
6. `scripts/CHROMIUM_VERSION` = `155.0.8059.39`: newest Linux stable entry from `versionhistory.googleapis.com` on 2026-10-09. That the tag exists in `chromium/src` is unverified (googlesource unreachable).
7. `scripts/DEPOT_TOOLS_REV` is unset (depot_tools unpinned).
8. `docs/build-host.md` measured times are all `TODO: measure on real host`; sizing figures not re-verified against Chromium docs.
9. Weekly bump job logic (`--latest-stable`, draft PR creation) and `rebase.sh --latest-stable` network path.

## Open items

CR-1..CR-6 untouched and open. Provenance review (task 0.6) is in `docs/PATCH-PROVENANCE.md`: Helium is GPL-3.0 (no reuse), ungoogled-chromium BSD-3-Clause, Brave MPL-2.0.
