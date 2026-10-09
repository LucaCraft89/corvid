# Phase 3 (Windows) status report, 2026-10-09

Environment: Linux sandbox. No Windows, no Chromium tree, no `pwsh`. Nothing below was built or run on Windows. "UNVERIFIED" = needs a Windows host (or a real Chromium tree). The phase is NOT complete; no acceptance test has passed on Windows.

## What was actually executed here
| Check | Result |
|---|---|
| `node --test "src-overlay/corvid/windows/updater/*.test.mjs"` | 12/12 pass (Node 22.22) |
| `node --experimental-strip-types --test "theme/providers/windows/*.test.ts"` | 7/7 pass |
| `node --experimental-strip-types --test "src-overlay/corvid/windows/titlebar/*.test.ts"` | 4/4 pass |
| `.github/workflows/windows.yml` parsed with PyYAML | parses (not run on GitHub; no schema/actionlint check) |
| PowerShell scripts | NOT parsed or linted (`pwsh`/PSScriptAnalyzer unavailable). Only a crude bracket-balance script ran; it flagged `common.ps1` and `verify.ps1`, which I believe are false positives from `'#'` / `# Phase` inside strings but did not confirm. The CI job `lint-and-unit` runs the real parser and PSScriptAnalyzer on first run. |

## Task status
| ID | Deliverable | State |
|---|---|---|
| 3.1 | `scripts/{common,bootstrap-host,fetch,apply-patches,refresh-patches,build,package,verify}.ps1`, `build/args/win-{release,debug}.gn`, `.github/workflows/windows.yml` | Written, UNVERIFIED. Depends on Phase 0 artifacts that do not exist yet in this branch (`scripts/CHROMIUM_VERSION`, `patches/series`); scripts tolerate a missing `patches/series` but require the pin. GN arg names unchecked against a real tree (`gn args --list` first). |
| 3.2 | `patches/series.phase3` (empty, five planned patches listed), `patches/windows/` | No patches: cannot be authored without a tree. UNVERIFIED/NOT STARTED. |
| 3.3 | `src-overlay/corvid/windows/installer/DESIGN.md` (reuse mini_installer/setup.exe; WiX deferred) | Design only. |
| 3.4 | `docs/specs/updater.md`; `updater/manifest.mjs` (Ed25519 signed manifest, threshold keys, expiry, sequence anti-replay, downgrade, origin, rollout, artifact hash, rollback decision), `make-manifest.mjs`, tests | Design complete; reference logic tested (12 tests). C++ updater, scheduled tasks, installer integration NOT built. `make-manifest.mjs` CLI itself was not exercised (library is). |
| 3.5 | `theme/providers/windows/index.ts` + tests (pure logic); C++ `accent/accent_watcher.{h,cc}` | TS tested. C++ never compiled, UNVERIFIED; high-contrast change notification wiring is a TODO in the .cc. |
| 3.6 | `hello/DESIGN.md` | Design only; depends on Phase 2 software authenticator. |
| 3.7 | `titlebar/titlebar.{ts,css,test.ts}` (drag-region computation, CSS vars, forced-colors rules) | Logic tested; CSS/visual, snap layouts (needs native HTMAXBUTTON hit-testing), high-DPI UNVERIFIED. Not yet a Lit component or registered WebUI page. |
| 3.8 | `docs/security/code-signing.md` options and questions | Options only; no decision made. |

## Acceptance tests (`tests/acceptance/phase-3/`, run via `scripts/verify.ps1 -Phase 3`)
Scripts 01-06 exist. Exit 2 = SKIPPED (never counted as pass). 04 and 06 are manual-only stubs; 03 checks light/dark through a placeholder debug endpoint that does not exist yet and always ends SKIPPED because the accent step is manual. All six are UNVERIFIED and none has run.

## Open questions for the user (not decided by this work)
1. Code-signing certificate option and distribution channel (installer download, winget, Store): see `docs/security/code-signing.md`.
2. Windows arm64 in Phase 3 or later? (GN args are x64 only.)
3. Proprietary codecs (CR-3) left at upstream default in `win-release.gn`.
4. Update server URL (`urls.update_server` is empty; updater stays inert until set) and who holds the Ed25519 manifest-signing key.
5. Confirm the mini_installer-over-WiX choice, and whether an MSI is wanted for enterprise.

## Next steps on a Windows host
Provision per `scripts/bootstrap-host.ps1`; fetch pinned Chromium; `gn gen` with `win-debug.gn` and fix arg names; author patches 0001-0005 with `refresh-patches.ps1`; build `chrome mini_installer`; compile the accent glue; run `verify.ps1 -Phase 3` and replace this report's UNVERIFIED rows with evidence.
