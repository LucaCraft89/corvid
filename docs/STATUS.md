# STATUS

Updated: 2026-10-31

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
- Phase 5 (2026-10-31): webui pages and diagnostics inside the browser. 5 patches (1,136 lines, 30 file diffs): `patches/common/{webui-newtab,webui-settings,webui-error-pages,diagnostics}.patch`, `patches/linux/gtk-accent.patch`. List and file counts: `docs/patches.md`.
  - How pages get in: `build/webui-sync.sh` (patch step `webui`, and before every `build/build.sh`) runs `webui/scripts/build.mjs --chromium` and rsyncs to `/work/src/components/corvid_webui/dist/` (not a patch). `components/corvid_webui/BUILD.gn` (in the newtab patch) packs the listed files with `generate_grd` + `grit` into `corvid_webui_resources.pak`, repacked into `resources.pak` (resource IDs: entry in `tools/gritsettings/resource_ids.spec` after Helium's). One controller `corvid::CorvidUI` (`chrome/browser/ui/webui/corvid/`) serves any page by folder name; `corvid-init.js` is generated per request (prefs, accent, read-only flag). Prefs: one profile dict pref `corvid.webui_prefs`; pages sanitize it.
  - New tab: `chrome://new-tab-page` (normal) and `chrome://newtab` (private/guest) are ours; the browser still treats it as the NTP (empty focused omnibox, "New tab" title). Private windows: read-only prefs. Settings: `corvid://preferences`, link row "New tab and built-in pages" at the top of Settings > Appearance. Error pages: renderer net error page and SSL interstitial render webui's error page (one inlined HTML, info in `window.corvidErrorInfo`, buttons via `errorPageController` / `certificateErrorPageController`, cert chain from `SSLInfo`).
  - Accent (Linux): Chromium 156 already reads the portal `accent-color` into `NativeTheme::user_color()`; the patch makes `ThemeService::UsingDeviceTheme()` true on Linux while the user has no colour/theme/GTK theme (ChromeOS rule), and falls back to the GTK selection colour without a portal. webui: new `seedSource` pref (`system` default = desktop accent, else the chosen seed) and a "Desktop accent colour" swatch; live updates via `NativeThemeObserver`.
  - Diagnostics: `corvid::DiagnosticsLog`, 200-entry in-memory ring buffer, UI thread. Per-tab observer (attached in `TabHelpers`): main-frame net errors (`tls` for certificate and `ERR_SSL_*`, else `network`), renderer gone (crashed/killed/OOM), renderer unresponsive; `BrowserChildProcessObserver` for GPU/utility/network-service crashes. Host only (http/https), nothing from private windows, never on disk or sent. Page `corvid://diagnostics` (copy, clear, live).
  - Tests, all run on this build: `npm run check` in webui/ PASS (typecheck, 46 unit tests, render check 13 pages x 3 widths x 2 schemes = 80 screenshots). `npm run browser-check` (new, real browser, headed on Xvfb) 39/39 PASS: newtab (ours, live update between tabs, kept after restart), private NTP read-only, settings (swatch default, change reaches NTP and profile, Settings entry opens it), errors (unknown host, refused, self-signed cert incl. chain and "continue" loads the site), accent (stock GTK = #3584e4, red GTK theme = #e01b24 and frame #fff8f7, portal #339933 and frame #f7fbf1, live portal change to #cc6600 reaches the page and the frame #fff8f5), diagnostics (network, tls, renderer crash, network service crash via SIGSEGV, private window without host), hang (logged after 30 s). Strict apply of the whole series to the base files reproduces the built tree byte for byte.
  - Rebuilds per patch (ccache, `-j 22`): newtab 2m 6s, settings 16m 48s, error pages 2m 16s, accent 34s, diagnostics 1m 9s.
  - Dropped: HTTPS-First page. Chromium 156 shows a native dialog over a blank page there (`kHttpsFirstDialogUi`), not an HTML interstitial, so no patch.

## Gate result (Corvid binary, 15 min)
`build/privacy-gate.sh --minutes 15` on the phase 5 binary (all 5 patches; startup page is the Corvid new tab), run 2026-10-31 12:33, `/work/gate/20261031-123318/`, log `build/logs/privacy-gate-p5.txt` (same result as phase 2, 2026-10-30):
```
DNS lookups (0)
Connections (0)
URLs requested by the network stack (2, from the net log):
  GET trk:https://helium-services-are-disabled.qjz9zk/en-US-10-2.bdic  x1
  POST trk:https://helium-services-are-disabled.qjz9zk/  x1
Hosts resolved by the browser (0)
PASS: nothing outside the allowlist
```
Self-test of the gate (`-- https://example.com`, 1 min, 2026-10-31, `/work/gate/20261031-124845/`): FAIL as expected, listing the `example.com` DNS lookup and its TCP and QUIC connections.

## What is still stock (phase 5 end)
Reachable in normal use:
- Chromium/Helium settings (`corvid://settings`) apart from our link row; the Customize side panel ("Theme" row). Our preferences page only sets the look of our pages and the new tab search box: its search engine does not change the address bar's engine, and its theme/colour do not change the browser frame (the frame follows the desktop accent or the stock theme settings).
- HTTPS-First: native dialog over a blank page. Other interstitials: captive portal, bad clock, MITM software, blocked interception, lookalike URL, supervised user and policy blocks (all still Chromium's HTML; `SSLErrorHandler` picks some of them for certificate errors). Safe Browsing pages are off in Helium (`safe_browsing_mode=0`).
- Installed web app offline page (Chromium's override, not the net error page).
- Other internal pages: history, downloads, bookmarks, extensions, passwords, print preview, PDF viewer, `corvid://version`, `corvid://crashes`, Helium's first-run onboarding (`corvid://setup`).
- Error pages and the SSL page use the default seed with light/dark from the system, not the user's page prefs (the renderer has no profile prefs; the interstitial could get them later).
- Page strings are English only (`webui/src/strings/en.ts` is not a .grdp yet).


## Next
- Phase 6 (`docs/PHASES.md`).
- Phase 5 follow-ups: decide whether `corvid://preferences` should drive the browser frame colour (ThemeService) and the address-bar search engine (TemplateURLService) instead of only our pages; give the SSL page the user's theme prefs; turn `en.ts` into a .grdp; replace the remaining interstitials listed above if they matter; Windows/macOS accent comes with phase 8.
- Phase 4 follow-ups: run `docker build` where Docker exists; test `--tls-cert`; optional admin page (metadata only) and change notifications are not built; phase 7 writes a `SyncVaultTransport` for our API (Helium's engine expects the extension provider), wires pairing/recovery into a WebUI page (add it as a `CorvidUIConfig` page like phase 5's), and must never use Helium's provider key-wrapping path.
- webui follow-ups: no translations yet; owner still to pick default seed, typeface and density (PROJECT.md open questions 7 and 8).
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
build/webui-sync.sh                      # webui/ -> /work/src/components/corvid_webui/dist (build.sh runs it too)
cd webui && npm run browser-check        # phase 5: pages in the real browser (~6 min; as root; DISPLAY or own Xvfb)
cd webui && npm run browser-check -- errors accent   # some checks: newtab settings errors accent diagnostics hang private
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
- Phase 5: `webui/` changes reach the browser only through `build/webui-sync.sh` + a build (a new page file must also be listed in `components/corvid_webui/BUILD.gn`). The resource map is `kCorvidWebuiResources`; `CorvidUI` serves `<page>/*` without the folder and `shared/*` as is.
- Chromium ignores renderer hangs in tabs with DevTools attached (Playwright attaches to every tab), and the hang monitor only fires when input to a visible tab goes unanswered for 30 s. The hang check opens the page through `/json/new` (no attach), clicks with xdotool, and reads `corvid://diagnostics` over a socket to that tab only (`connectOverCDP` would wait on the hung tab). Playwright also passes `--disable-hang-monitor` by default (removed in `browser-check`).
- `chrome://hang` crashes the renderer in this DCHECK build instead of hanging; `chrome://gpucrash` only acts on a typed navigation. The diagnostics check crashes the network service with SIGSEGV instead.
- `dbus-send` without `--print-reply` or `--type=method_call` sends a signal, not a call; the live accent test first failed because of it.
- No window manager on the VM: `xdotool key` does not reach the browser (no focus); clicks do. A real Ctrl+T was not tested; the startup tab and `chrome://newtab` are.
- Port 80 on the VM is taken by a lighttpd service (not ours; left alone).
- Installed this session: `python3-gi` (apt, for `webui/scripts/fake-portal.py`); `build/deps.sh` now lists the browser-check packages.
- Playwright contexts from `browser.newContext()` are off-the-record profiles: that is how `browser-check` tests private windows.
- webui pages call `startPage()` last in each module: calling it earlier ran `render()` before module constants existed (TDZ) and silently killed the settings page.
