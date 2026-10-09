# Build host (task 0.1)

Status: procedure and sizing written; **no measurements taken**. Every measured figure below is `TODO: measure on real host`. Sizing numbers come from `skills/bootstrap-build-host` and were **not re-verified against current Chromium docs** (the docs host was unreachable from the authoring sandbox). Re-check before provisioning.

## Sizing

| Resource | Minimum | Recommended | Notes |
|---|---|---|---|
| OS | Linux x86_64, case-sensitive FS | Ubuntu LTS | Checkout must be on local SSD, not a network mount |
| RAM | 32 GB | 64 GB | If short, lower `CORVID_JOBS` (autoninja `-j`) before assuming the build is broken |
| Disk | 150 GB free SSD | 300 GB+ | Source + one out dir; more with Android or several out dirs |
| CPU | 8 cores | 16+ cores | Full build time scales roughly linearly with cores |
| Compile cache | none | sccache (local) or remote cache/RBE | Config recorded below once chosen |

Windows and Android hosts are out of scope for Phase 0 (see `build-windows`, `build-android`).

## Procedure

1. Install prerequisites: git, python3 (3.11+ for `scripts/render-branding.py`), curl, shellcheck (for lint), sccache (optional).
2. Clone this repo anywhere. **Never** put the Chromium checkout inside it.
3. `scripts/fetch.sh` clones `depot_tools` to `~/depot_tools` (override `DEPOT_TOOLS`), then `fetch --nohooks chromium` into `~/chromium/src` (override `CORVID_SRC`; basename must be `src`), checks out the tag in `scripts/CHROMIUM_VERSION`, runs `gclient sync -D --with_branch_heads --with_tags`.
4. Run `build/install-build-deps.sh` from the checkout once per host (needs sudo), then `gclient runhooks` if sync did not.
5. Compile cache: export `SCCACHE_DIR` and `SCCACHE_CACHE_SIZE`; `scripts/build.sh` adds `cc_wrapper="sccache"` automatically when `sccache` is on PATH.
6. One-command smoke: `scripts/build.sh linux debug` (fetch, apply patches, gn gen, autoninja chrome, `--version` check, headless launch).
7. Phase 0 acceptance: `CORVID_ALLOW_BUILD=1 scripts/verify.sh --phase 0 --platform linux`.

### CI runner

`.github/workflows/nightly-build.yml` expects a self-hosted runner labelled `corvid-builder` with the checkout, depot_tools and sccache on persistent disk under `/srv/corvid/` (paths set in the workflow `env`). GitHub-hosted runners are too small for a Chromium build.

## Measurements (fill in on the first real host)

| Item | Value |
|---|---|
| Host (CPU model, cores) | TODO: measure on real host |
| RAM | TODO: measure on real host |
| Disk used after sync / after first build | TODO: measure on real host |
| `gclient sync` time | TODO: measure on real host |
| First full `chrome` debug build | TODO: measure on real host |
| Incremental build (touch one `.cc`) | TODO: measure on real host |
| sccache hit rate on second clean build | TODO: measure on real host |
| Date and Chromium version measured | TODO: measure on real host |

## Known gaps

- `scripts/DEPOT_TOOLS_REV` is unset, so depot_tools is not pinned yet (reproducibility risk named in the Phase 0 spec). Pin it on the first host that can reach googlesource.
- The `gn` args in `scripts/build.sh` are a reasonable starting set, not validated against the pinned release.

## Runner topology (decided 2026-10-09)

The user is open to GitHub-hosted runners, a cloud container, or their own machine. Decision: split.

| Work | Where | Why |
|---|---|---|
| Script lint, fixture tests, patch-apply check (sparse/patch-only clone) | GitHub-hosted `ubuntu-latest`, every PR | Cheap; needs only the files the series touches |
| Full Chromium fetch + build, Phase 0 acceptance on real tree | Self-hosted runner, label `corvid-builder`, on the user's PC | Standard hosted runners are assumed to lack the disk and job time for a full Chromium build. **UNVERIFIED:** current hosted-runner disk, RAM and job-time limits were not checked (docs.github.com was unreachable from the authoring sandbox). Check them before stating numbers. |
| Weekly Chromium bump | GitHub-hosted, patch-only mode | Only needs patch application |

`nightly-build.yml` runs only when the repository variable `CORVID_BUILDER_ENABLED` is `true`; otherwise the job is skipped cleanly (not failed). Set it after the runner below is registered and online. If it is set while the PC is off, the job waits in the queue and GitHub eventually cancels it; turn the variable off when the PC is unavailable.

### Register your PC as the `corvid-builder` runner

1. In GitHub: repo Settings > Actions > Runners > New self-hosted runner > Linux x64. Run the download and `./config.sh --url ... --token ...` commands shown there. When prompted for labels, add `corvid-builder`.
2. Create the directory the workflow expects: `sudo mkdir -p /srv/corvid && sudo chown "$USER" /srv/corvid`.
3. Install the prerequisites from "Procedure" above (plus `sccache`).
4. Start it: `./run.sh` (foreground) or `sudo ./svc.sh install && sudo ./svc.sh start` (service).
5. Repo Settings > Secrets and variables > Actions > Variables: add `CORVID_BUILDER_ENABLED` = `true`.
6. Security: a self-hosted runner executes workflow code on your machine. Keep the repo private or never run it for fork PRs (the nightly job uses only `schedule` and `workflow_dispatch`, never `pull_request`).

## Run this on your PC (Phase 0 acceptance, real Chromium)

Prereqs: Linux x86_64; at least 32 GB RAM (64 GB better); at least 150 GB free SSD on the filesystem holding `~/chromium` (300 GB+ is comfortable); 8+ cores; internet; sudo. Packages: git, python3 (3.11+), curl, shellcheck, optionally sccache. Expect the first run to take hours and download tens of GB.

```
git clone <this repo> corvid && cd corvid
git checkout worktree-agent-a004ca365e955b77e      # or the merged branch
export CORVID_SRC=$HOME/chromium/src               # basename must be "src"
scripts/fetch.sh                                   # depot_tools + Chromium at the pinned tag
( cd "$CORVID_SRC" && build/install-build-deps.sh )   # once; needs sudo
CORVID_ALLOW_BUILD=1 scripts/verify.sh --phase 0 --platform linux
```

If RAM is short, `export CORVID_JOBS=8` (or lower) before the last command. If the pinned tag does not exist, report that; do not edit the pin.

Send back: the single file `docs/reports/phase-0-linux-<date>-run.md` (host info, result table, log tails). Also note wall-clock times of `fetch.sh` and the build so the TODO table above can be filled. Do not trim failures from the report.
