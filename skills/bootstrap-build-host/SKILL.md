---
name: bootstrap-build-host
description: Size and set up a machine (local or remote) that can build Chromium for Corvid. Use at Phase 0 start or when adding a new build host/CI runner.
---

# bootstrap-build-host

## Requirements (verify against current Chromium docs before buying/provisioning)
- Linux x86_64, 32 GB RAM minimum (64 GB recommended), 150 GB free SSD for source + one build (300 GB+ with Android and several out dirs), 16+ cores ideal.
- Windows builds: Windows 10/11 x64, Visual Studio with the components in Chromium's Windows build doc, Windows SDK. Separate host or CI runner.
- Android builds: Linux host only, Android SDK/NDK pulled by Chromium's own scripts.

## Steps
1. Install prerequisites: git, python3, curl, `depot_tools` (clone to `~/depot_tools`, add to PATH).
2. Create `~/chromium/` and run `fetch --nohooks chromium` only through `scripts/fetch.sh` (pins to the version in `scripts/CHROMIUM_VERSION`).
3. Run `build/install-build-deps.sh` from the Chromium checkout, then `gclient runhooks`.
4. Set up compile cache: `sccache` or a remote cache/RBE if using a cloud builder. Record the config in `docs/build-host.md`.
5. Create a dated sizing note: cores, RAM, disk, first full build time, incremental build time.
6. Smoke test: `scripts/build.sh linux debug` builds `chrome` and launches it.

## Done when
- `docs/build-host.md` exists with specs and measured build times.
- Clean checkout -> build -> launch works with one command.

## Pitfalls
- Never put the Chromium checkout inside the Corvid repo. The repo stores patches and scripts only.
- Use a case-sensitive filesystem. Keep the checkout off network mounts.
- If RAM is short, lower parallelism (`autoninja -j`) before assuming the build is broken.
