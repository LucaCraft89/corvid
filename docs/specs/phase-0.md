# Phase 0 spec: Foundations

Goal: a reproducible pipeline that fetches pinned Chromium, applies Corvid patches/overlay, builds, and rebases. No product features yet.

## Tasks
| ID | Task | Skill | Output |
|---|---|---|---|
| 0.1 | Size and provision build host | `bootstrap-build-host` | `docs/build-host.md` with specs + measured build times |
| 0.2 | Repo scaffold | - | Directory layout from AGENTS.md; `branding/config.toml` (name=Corvid, ids, icon paths) |
| 0.3 | Patch tooling | `fetch-and-apply-patches` | `scripts/fetch.sh`, `apply-patches.sh`, `refresh-patches.sh`, `CHROMIUM_VERSION`, `patches/series` |
| 0.4 | Rebase pipeline | `rebase-chromium` | `scripts/rebase.sh`, `docs/rebase/` reports |
| 0.5 | CI | - | Pipeline: patch-apply check on PR; nightly Linux build with cache; weekly "Chromium stable bump" job opening a draft change |
| 0.6 | Provenance review | `add-patch` | `docs/PATCH-PROVENANCE.md` listing candidate upstream patch sources (Helium, ungoogled-chromium, Brave) with license, what to reuse, what to write fresh |
| 0.7 | Branding render | - | Template step that substitutes names/ids/icons from `branding/config.toml`; renaming the project = edit one file |
| 0.8 | Test harness skeleton | `verify-phase` | `scripts/verify.sh`, `tests/acceptance/phase-0/` |

## Order
0.1 -> 0.2 -> 0.3 -> (0.4, 0.7 in parallel) -> 0.5 -> 0.8. 0.6 any time.

## Acceptance tests (`tests/acceptance/phase-0/`)
1. `clean-build.sh`: on a fresh machine/container, one command fetches, applies, builds `chrome` (Linux debug) and launches it headless, printing the version string showing "Corvid".
2. `idempotent-apply.sh`: applying the series twice leaves a clean tree, no `.rej`/`.orig`.
3. `rename.sh`: change `name` in branding config to a test value, rebuild branding step, grep the tree for the old name outside allowed credits files: zero hits.
4. `rebase-dry-run.sh`: run `rebase.sh` to the next available stable tag in a scratch tree; a report is produced even if conflicts exist.
5. CI shows green on a trivial patch PR and red on a deliberately broken patch.

## Out of scope
Any user-visible feature, Google removal beyond what is needed to build.

## Risks
Build host sizing (resolve first); depot_tools/`gclient` version drift (pin in scripts).
