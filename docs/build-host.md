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

## Measurements (M0, 2026-10-09/10, Chromium 155.0.8059.39)

| Item | Value |
|---|---|
| Host | Fedora 44, kernel 7.2.8, Ryzen 9 7900X (12C/24T), RTX 4070 (unused for build) |
| RAM / swap | 31.9 GB; zram 8 GB + 24 GB btrfs swapfile (`/home/swap/swapfile`, `btrfs filesystem mkswapfile`, not in fstab) |
| Storage | 2 TB DRAM-less Gen4 NVMe, btrfs `/home` |
| Disk used | ~113 GB after sync (`~/chromium`), +34 GB `out/Debug` after first build (~147 GB) |
| Fetch time | initial clone ~30 min (93.5 GiB pack at ~90 MiB/s, 22:32-23:01); whole fetch took ~2 h wall because of googlesource HTTP 429 on parallel dep clones and a stalled `git fetch` of all refs (see Known gaps) |
| First full `chrome` debug build | ~70 min compile (jobs=20, sccache cold), link done ~01:20; output "Corvid 155.0.8059.39" |
| Incremental (touch `chrome/browser/chrome_content_browser_client.cc`) | 68 s wall (jobs=20, includes relink) |
| sccache hit rate on second clean build | not measured (no second clean build yet) |

## Fedora host + Ubuntu distrobox (how M0 was built)

Chromium's `install-build-deps.sh` is Debian-only, so the host (Fedora 44) fetches and the build runs in a container sharing `$HOME`:

```
distrobox create --yes --name corvid-build --image docker.io/library/ubuntu:24.04 --additional-flags "--security-opt label=disable"
distrobox enter corvid-build -- sudo apt-get install -y git python3 curl lsb-release xz-utils file build-essential pkg-config shellcheck
distrobox enter corvid-build -- sudo ~/chromium/src/build/install-build-deps.sh --no-prompt --no-chromeos-fonts --no-arm --no-nacl
# sccache: host binary copied to /usr/local/bin/sccache inside the container
distrobox enter corvid-build -- bash -lc 'cd ~/chromium && PATH=$HOME/depot_tools:$PATH gclient runhooks'
```

`~/chromium/src` and `~/depot_tools` are shared with the host (checkout stays on NVMe). Run any script in the container with `CORVID_BUILD_CONTAINER` (handled in `scripts/lib.sh`, re-execs via `distrobox enter`; `CORVID_SRC`, `CORVID_JOBS`, `CORVID_ALLOW_BUILD`, `SCCACHE_DIR`, `SCCACHE_CACHE_SIZE` are forwarded):

```
CORVID_BUILD_CONTAINER=corvid-build CORVID_ALLOW_BUILD=1 CORVID_JOBS=20 SCCACHE_DIR=$HOME/sccache scripts/verify.sh --phase 0 --platform linux
```

Desktop-integration tests (GNOME/KDE accent, Wayland/X11, rpm install, GPU) run on the Fedora host with the container-built `out/Debug/chrome`.

## Known gaps

- depot_tools is pinned to `50cc30f5dbb8d56b4b45fe3223c572ef01d38198` (`scripts/DEPOT_TOOLS_REV`), the revision used for M0.
- Fetch hazards seen: googlesource returns 429 if gclient clones many deps at once (use `CORVID_FETCH_JOBS`, default 4); `--with_branch_heads --with_tags` made `git fetch origin` pull every ref and stall, so they were dropped (the pinned tag is fetched explicitly). A half-cloned dep dir (e.g. third_party/perfetto) must be deleted before re-sync.
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
git checkout claude/busy-rubin-t8bloc                  # merged branch with all phases
export CORVID_SRC=$HOME/chromium/src               # basename must be "src"
scripts/fetch.sh                                   # depot_tools + Chromium at the pinned tag
( cd "$CORVID_SRC" && build/install-build-deps.sh )   # once; needs sudo
CORVID_ALLOW_BUILD=1 scripts/verify.sh --phase 0 --platform linux
```

If RAM is short, `export CORVID_JOBS=8` (or lower) before the last command. If the pinned tag does not exist, report that; do not edit the pin.

Send back: the single file `docs/reports/phase-0-linux-<date>-run.md` (host info, result table, log tails). Also note wall-clock times of `fetch.sh` and the build so the TODO table above can be filled. Do not trim failures from the report.
