# STATUS

Updated: 2026-10-30

## Done
- Phase 0: repo reset to a fresh root (old work kept in history on branch `claude/busy-rubin-t8bloc`), skeleton created, `docs/PROJECT.md` committed, base researched: `docs/decisions/001-base.md`.
- Phase 1: Helium base built and launched on the Linux VM (2026-10-29).
  - Base: helium-linux `f6d9a70b2b2c73b12ebb9dacf7deb49632ffe15b`, helium-chromium submodule `58261a24341935be831fa3b97d31c46232c81b59` (revision 2). 346 main patches and 7 Linux patches applied cleanly.
  - Cold build: 6h 45m for 56,615 ninja steps, `-j 22`. fetch 4m (3.1 GB download), patch 6m, gn gen 9s.
  - Westmere (no AVX): the prebuilt clang 24, rustc 1.100 nightly, gn, ninja 1.12.1, node 24 and siso all run.
- Phase 2 (2026-10-30): patch workflow, branding, privacy gate.
  - Binary: `/work/src/out/Default/corvid`. `--version` prints `Corvid 0.20.2.1 (Chromium 156.0.8078.73)`. Under Xvfb the window title is "New Tab - Corvid"; `corvid://version` shows "Corvid", "The Corvid Authors" and the placeholder logo. Default profile: `~/.config/io.github.lucacraft89.corvid.dev` (Helium's stays separate).
  - Branding: name only in `build/branding.conf`; `build/brand.py` (patch step `brand`) rewrites UI strings (1,380 .grd/.grdp/.xtb files, translation IDs remapped with Helium's own code), BRANDING, URL scheme `corvid://`, binary and crash handler names, profile folder, desktop file name, env vars (`CORVID_DESKTOP`, `CORVID_CONFIG_HOME`), package metadata, 16 placeholder icons. Strings naming "Helium services" keep the name (they are imput's servers).
  - Patch workflow: `patches/common` then `patches/linux`, applied strictly after branding (`build/apply-patches.sh`, step `corvid-patches`). `build/srcgit.sh` + `build/refresh-patches.sh` regenerate patches from the tree. How-to: `docs/patches.md`. Tested on a scratch tree (new patch, second patch with a new file, fold into existing patch, refuse dirty tree, fresh re-apply, idempotent refresh) and on the real tree (track, refresh, strict re-apply, then removed the test patch).
  - Rebuild after branding: 22m 13s (1,359 steps, `-j 22`).
  - Privacy gate (`build/privacy-gate.sh`): browser in its own network namespace behind NAT, sandbox on, as user `tester`, fresh profile, Xvfb, idle 15 min; tcpdump + tshark + Chromium net log; compared with `docs/network-allowlist.md` (empty).
    - Helium base binary: PASS. 0 DNS lookups, 0 connections. Net log: 2 requests to `helium-services-are-disabled.qjz9zk` stopped inside the browser by the `trk:` scheme, never sent.
    - Corvid binary: PASS, same result (below).
  - Leak patches: none needed; the series is empty.

## Gate result (Corvid binary, 15 min)
`build/privacy-gate.sh --minutes 15`, run 2026-10-30 12:10, `/work/gate/20261030-121002/`:
```
DNS lookups (0)
Connections (0)
URLs requested by the network stack (2, from the net log):
  GET trk:https://helium-services-are-disabled.qjz9zk/en-US-10-2.bdic  x1
  POST trk:https://helium-services-are-disabled.qjz9zk/  x1
Hosts resolved by the browser (0)
PASS: nothing outside the allowlist
```
Self-test of the gate (`-- https://example.com`, 1 min): FAIL as expected, listing the `example.com` DNS lookup and its TCP and QUIC connections.

## Next
- Phases 3 and 4 (independent), then phase 5 (`docs/PHASES.md`).
- Rebrand gaps for later: favicons of internal pages are still Helium's (only product logos are placeholders); the about text "made possible by the ... open source project" now names Corvid twice (should credit Chromium and Helium); `MAINTMAIL` in the Linux package info still says Helium's; code identifiers (`kHeliumUIScheme`, `helium_onboarding`) are internal and stay.

## Exact commands
```sh
build/deps.sh            # apt packages (Debian 13), once
build/all.sh --tmux      # fetch, patch (incl. brand + our patches), configure, build
build/fetch.sh && build/patch.sh && build/configure.sh && build/build.sh
/work/src/out/Default/corvid --user-data-dir=$HOME/.config/corvid-dev   # not as root, or --no-sandbox
build/privacy-gate.sh                     # as root; --minutes N; -- URL to self-test (must FAIL)
build/srcgit.sh track FILE; edit; build/refresh-patches.sh --into common/NAME.patch   # see docs/patches.md
```
Fresh tree: `rm -rf /work/src && build/all.sh`. Steps leave `.NAME.stamp` files in `/work/src`; a re-run skips finished steps. Logs: `build/logs/` (git-ignored); gate runs keep pcap, net log and summary in `/work/gate/<time>/`.

GN args = Helium's `flags.gn` + `flags.linux.gn` minus the overridden keys, plus: `is_official_build=false is_component_build=true is_debug=false symbol_level=0 blink_symbol_level=0 use_thin_lto=false is_cfi=false chrome_pgo_phase=0 use_sysroot=true use_siso=false cc_wrapper="ccache"`. See `build/configure.sh`.

## Gotchas
- Data drive: `/dev/sdb` (300 GB), ext4, label `corvid-work`, mounted at `/work` from `/etc/fstab` (by UUID, `nofail`). `CORVID_WORK=/work` in `build/config.sh`; scripts refuse to run if it is on the root disk.
- ccache: Chromium 156 uses Clang modules; ccache needs `modules` sloppiness and `CCACHE_DEPEND=1` (both in `config.sh`).
- Chromium won't start as root with the sandbox. Use user `tester` or `--no-sandbox`.
- Internal pages (`corvid://…`, `chrome://…`) given on the command line are ignored, headed or headless. To open one in a test, start with `--remote-debugging-port=9333` and `curl -X PUT 'http://127.0.0.1:9333/json/new?chrome://version'`.
- srcgit work tree is the Chromium tree, which has a `base/` folder: the start tag is `corvid-base`, not `base`. Never `srcgit add -A` without paths.
- Gate: glibc's `resolve` module would send lookups through the host's systemd-resolved socket, around the capture; the gate gives its namespace an `nsswitch.conf` with `hosts: files dns`. IPv4 only in the namespace. Host LLMNR packets on the veth are ignored (only the browser's address counts).
- brand.py: ElementTree adds an XML declaration when it rewrites a .grdp; Helium's onboarding string generator rejects that, so files that had none get none back.
- The dev build has Helium's services pointed at `helium-services-are-disabled.qjz9zk` (domain substitution) and blocked by `trk:`; that is why the base is silent. Re-check the gate whenever Helium or our flags change.
- The build uses plain ninja (`use_siso=false`). Helium's own builds use siso.
- Helium tracks Chromium 156.0.8078.73; PROJECT.md says 155.
- Helium has a sync engine in its patches; phases 4 and 7 start from it.
- Helium bans AI-written upstream PRs; never send PRs upstream.
