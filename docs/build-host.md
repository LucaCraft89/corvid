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
