---
name: build-linux
description: Configure, build, test, and package Corvid for Linux (x86_64, then arm64 if wanted). Use for local builds and the Linux CI job.
---

# build-linux

## Steps
1. `scripts/fetch.sh` then `scripts/apply-patches.sh` (skill: `fetch-and-apply-patches`).
2. GN args live in `build/args/linux-release.gn` and `linux-debug.gn` (committed). Baseline: `is_official_build` for release (check build time and memory first), `is_debug=false` for dev builds, `use_sysroot=true`, `proprietary_codecs`/`ffmpeg_branding="Chrome"` only if legally acceptable to the user (ask), `enable_nacl=false`, and all Google-service args off (see `debrand-and-degoogle`). Use a component build for fast dev iteration.
3. `gn gen out/<name> --args=...` then `autoninja -C out/<name> chrome`.
4. Run tests: unit (`unit_tests`), browser (`browser_tests` with filters for Corvid), and the UI tests in `ui/`.
5. Package: `scripts/package.sh linux` producing `.deb`, `.rpm`, and an AppImage/tarball. Include desktop file, icons, MIME handlers, and update metadata.
6. Wayland and X11: test both. Check the GTK and native Wayland ozone paths (`--ozone-platform-hint=auto`).

## Done when
- Clean checkout builds and launches; tests pass; packages install and uninstall cleanly in a VM.

## Pitfalls
- Official builds are slow; use component/dev builds while iterating.
- Codec licensing is a legal question: ask the user before enabling proprietary codecs in distributed builds.
