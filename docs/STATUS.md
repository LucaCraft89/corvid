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
- Phase 3 (2026-10-30): Corvid internal pages in `webui/` (plain TypeScript and CSS, no framework). How-to: `webui/README.md`.
  - Colour engine: seed to full Material 3 palette with Google's material-color-utilities 0.4.0 (Apache-2.0), 2025 (M3 Expressive) spec; light/dark/automatic; standard/medium/high contrast; four styles (calm = tonal spot, expressive, vibrant, neutral); WCAG AA check on 59 foreground/background pairs, with a tone nudge as a safety net (the library alone already passes every pair tested).
  - Tokens: M3 Expressive shape scale, type scale, 4 px spacing, three densities (comfortable, compact, spacious), six motion springs turned into CSS `linear()` easings.
  - One string catalog `webui/src/strings/en.ts`; the product name is read from `build/branding.conf` at build time (`{product}`).
  - Pages: new tab (search with the chosen engine or open an address, shortcuts with monograms, no favicon fetches), settings (search engine incl. custom engines, theme mode, colour presets + picker, style, contrast, live preview with AA status, density, reset), error page (DNS, offline with auto-retry, connection, timeout, SSL with reason and "continue" only when overridable and only inside the details, blocked, generic; technical details: code, DNS, certificate chain, timings, retries, copy button).
  - Tests: `npm run check` in `webui/`: typecheck clean; 42 unit tests pass (incl. AA on 27 seeds x 2 modes x 3 contrasts x 4 styles = 648 palettes); render check PASS in the Corvid dev build (11 pages x 360/768/1440 px x light/dark = 66 renders + interaction flow, 68 screenshots in `webui/render-out/`, no console/CSP errors, no sideways scrolling).
- Phase 4 (2026-10-30): sync. Decision `docs/decisions/002-sync.md`, spec `sync/protocol/SPEC.md`, how-to `sync/README.md`.
  - Helium's sync (read from helium-chromium rev 2 and HEAD rev 3, helium-services HEAD): vault of encrypted objects (AES-256-GCM-SIV, hash-chained commits, snapshots + deltas, rollback/fork checks), but the transport is a browser *extension* API behind a disabled flag, no provider ships, no server exists (helium-services has none), settings handler missing, no device approval or revocation. Not end to end.
  - Decision: keep Helium's vault format byte for byte (phase 7 can reuse its engine and only add a transport), own server and own device layer (roster, pairing with comparison code, recovery key, revocation + key rotation).
  - `sync/server`: `corvid-sync-server` 0.1.0-dev, Go 1.26.10, SQLite via modernc.org/sqlite 1.61.0 (no cgo). Static binary 11 MB (`CGO_ENABLED=0`, `file`: statically linked). Ran it: serve, health, token, register, device list, 401 without credentials.
  - `sync/client`: reference library (vault layer, GCM-SIV, API, pairing, rotation, `corvid-kv-v1` payload).
  - Tests, all PASS (`go test -race ./...`, 16 tests): GCM-SIV on all 26 RFC 8452 vectors; our protobuf bytes equal `protoc --encode` with Helium's `sync_vault.proto` (from `/work/src`); vault epochs/collection, chunked payloads >4 MiB, tamper/wrong key/rollback/fork; server rules (compare-and-swap, content addresses, token single use/expiry, quota, account isolation, revoked = 401); end to end: two devices converge after offline edits (incl. delete and same-key conflict, then 80 more commits and a third device), tampered commit/head/roster and rollback rejected and reported with state unchanged, wrong recovery key / typo / forged pairing secret rejected, revoked device gets 401 and the old key cannot read the rotated vault while the remaining device keeps its offline edit. The end-to-end tests also PASS against the built binary (`CORVID_SYNC_SERVER_BIN`).
  - Skipped: `docker build` (no Docker on this VM; base image tags `golang:1.26.10-trixie` checked to exist on Docker Hub). No TLS run (the `--tls-cert` path is untested). Not tested against a running Helium/Corvid browser (phase 7).

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
- Phase 5 (`docs/PHASES.md`). Phase 4 follow-ups: run `docker build` where Docker exists; test `--tls-cert`; optional admin page (metadata only) and change notifications are not built; phase 7 writes a `SyncVaultTransport` for our API (Helium's engine expects the extension provider), wires pairing/recovery into a WebUI page, and must never use Helium's provider key-wrapping path. Mark phase 4 DONE in `docs/PHASES.md` (not edited this session: commits were limited to `sync/` and `docs/decisions/`). Phase 5 hooks for webui: replace `defaultStore()` (`webui/src/shared/prefs.ts`) with a browser-prefs store, feed `setCatalog()` from loadTimeData, set `window.corvidErrorInfo` / `window.corvidErrorActions` on the error page, turn `en.ts` into a .grdp.
- webui follow-ups: system colour seed (GTK accent, phase 5); no translations yet; owner still to pick default seed, typeface and density (PROJECT.md open questions 7 and 8).
- Rebrand gaps for later: favicons of internal pages are still Helium's (only product logos are placeholders); the about text "made possible by the ... open source project" now names Corvid twice (should credit Chromium and Helium); `MAINTMAIL` in the Linux package info still says Helium's; code identifiers (`kHeliumUIScheme`, `helium_onboarding`) are internal and stay.

## Exact commands
```sh
build/deps.sh            # apt packages (Debian 13), once
build/all.sh --tmux      # fetch, patch (incl. brand + our patches), configure, build
build/fetch.sh && build/patch.sh && build/configure.sh && build/build.sh
/work/src/out/Default/corvid --user-data-dir=$HOME/.config/corvid-dev   # not as root, or --no-sandbox
build/privacy-gate.sh                     # as root; --minutes N; -- URL to self-test (must FAIL)
build/srcgit.sh track FILE; edit; build/refresh-patches.sh --into common/NAME.patch   # see docs/patches.md
cd webui && npm ci && npm run check      # phase 3 pages: typecheck, unit tests, render check (~3 min)
cd webui && npm run dev                  # http://127.0.0.1:8077/
export PATH=/work/tools/go/bin:$PATH GOPATH=/work/tools/gopath GOCACHE=/work/tools/gocache   # Go for sync/
cd sync && go test -race ./...           # phase 4: all sync tests (~10 s)
cd sync && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /work/tmp/sync-bin/corvid-sync-server ./server
CORVID_SYNC_SERVER_BIN=/work/tmp/sync-bin/corvid-sync-server go test -count=1 ./e2e/   # in sync/
CORVID_PROTOC=/work/src/out/Default/protoc CORVID_VAULT_PROTO=/work/src/components/sync/engine/sync_vault/sync_vault.proto go test -run Protoc -v ./client/vault/
corvid-sync-server serve --db sync.db --listen 127.0.0.1:8443; corvid-sync-server token --db sync.db --account NAME
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
- Sync: Go is not from apt; it is the official 1.26.10 tarball (sha256 checked) in `/work/tools/go`, module cache in `/work/tools/gopath`. Research clones (helium-services, helium-chromium HEAD, RFC 8452) are in `/work/research/`. Go's standard library has no AES-GCM-SIV, so `sync/client/gcmsiv` implements it; keep the RFC vector test. Vault wire labels say `helium-private-sync-v1` on purpose (compatibility, not branding). The test vector JSON files are frozen: `-update` only for a deliberate format change.
- Helium bans AI-written upstream PRs; never send PRs upstream.
- webui render check: the Corvid dev build sometimes cancels the first navigation in a fresh headless tab (`net::ERR_ABORTED`, still `about:blank`, no request sent). The check retries up to 3 times and prints the count (0 or 1 per run so far). It runs the browser with `--no-sandbox` when started as root; it only loads localhost pages.
- webui: material-color-utilities has an extensionless import Node's ESM loader cannot resolve; tests are bundled with esbuild (`dist-test/`) rather than run from node_modules.
- webui pages call `startPage()` last in each module: calling it earlier ran `render()` before module constants existed (TDZ) and silently killed the settings page.
