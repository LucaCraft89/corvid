# STATUS

Updated: 2026-10-30

## Done
- Phase 0: repo reset to a fresh root (old work kept in history on branch `claude/busy-rubin-t8bloc`), skeleton created, `docs/PROJECT.md` committed, base researched: `docs/decisions/001-base.md`.
- Phase 1: Helium base built and launched on the Linux VM (2026-10-29).
  - Binary: `/work/src/out/Default/helium`. `--version` prints `Helium 0.20.2.1 (Chromium 156.0.8078.73)`.
  - Base: helium-linux `f6d9a70b2b2c73b12ebb9dacf7deb49632ffe15b`, helium-chromium submodule `58261a24341935be831fa3b97d31c46232c81b59` (revision 2). 346 main patches and 7 Linux patches applied cleanly.
  - Ran: headless `--dump-dom` executed JS; full UI under Xvfb as a non-root user with the sandbox on (12 processes, page rendered, uBlock icon present, no sandbox errors).
  - Build time: 6h 45m for 56,615 ninja steps, `-j 22`, cold cache. fetch 4m (3.1 GB download), patch 6m, gn gen 9s.
  - Disk: `/work` 24 GB used (downloads 3.1 GB, src 21 GB of which out/Default 8 GB, ccache 0.1 GB). Root disk 49%, unchanged by the build.
  - Westmere (no AVX): the prebuilt clang 24, rustc 1.100 nightly, gn, ninja 1.12.1, node 24 and siso all run.

## Next
- Phases 2, 3, 4 (`docs/PHASES.md`). Phase 2 adds our first patches under `patches/common` / `patches/linux`; `build/patch.sh` already applies them after Helium's (step `corvid`).

## Exact commands
```sh
build/deps.sh            # apt packages (Debian 13), once
build/all.sh --tmux      # fetch, patch, configure, build; tmux attach -t corvid-build
# or step by step:
build/fetch.sh && build/patch.sh && build/configure.sh && build/build.sh
# run (not as root, or add --no-sandbox):
/work/src/out/Default/helium --user-data-dir=$HOME/.config/corvid-dev
```
Fresh tree: `rm -rf /work/src && build/all.sh`. Steps leave `.NAME.stamp` files in `/work/src`; a re-run skips finished steps. Logs go to `build/logs/<step>-<time>.log` (git-ignored).

GN args = Helium's `flags.gn` + `flags.linux.gn` minus the overridden keys, plus: `is_official_build=false is_component_build=true is_debug=false symbol_level=0 blink_symbol_level=0 use_thin_lto=false is_cfi=false chrome_pgo_phase=0 use_sysroot=true use_siso=false cc_wrapper="ccache"`. See `build/configure.sh`.

## Gotchas
- Data drive: `/dev/sdb` (300 GB), ext4, label `corvid-work`, mounted at `/work` from `/etc/fstab` (by UUID, `nofail`). `CORVID_WORK=/work` in `build/config.sh`; scripts refuse to run if it is on the root disk.
- ccache: Chromium 156 compiles with Clang modules. ccache 4.11 skips every `-fmodules` call unless sloppiness includes `modules` AND depend mode is on (`CCACHE_DEPEND=1`). Both are now in `config.sh`, but the first build ran without them (90% uncacheable), so the cache is nearly empty. The next full build fills it. Checked: 20 deleted objects rebuilt with 20/20 hits.
- Chromium won't start as root with the sandbox. There is a local user `tester` for UI tests, or pass `--no-sandbox`.
- The build uses plain ninja (`use_siso=false`), which is still allowed in 156 without remote execution. Helium's own builds use siso.
- Old `/root/chromium` (84 GB) and `/root/depot_tools` deleted 2026-10-30 at the owner's request; root disk now 5% used.
- Helium tracks Chromium 156.0.8078.73; PROJECT.md says 155.
- Helium has a sync engine in its patches; phases 4 and 7 start from it.
- Helium bans AI-written upstream PRs; never send PRs upstream.
