# Phase 1 (Linux MVP) report, 2026-10-09

Scope of this pass: everything achievable **without a Chromium checkout** (the sandbox cannot fetch or build Chromium). Phase 1 is **not complete**: no acceptance test that needs a built browser has run. Nothing below claims otherwise.

Legend: **PASS** = ran here, real output. **FAIL** = ran and failed. **UNVERIFIED** = written, not compiled/run (needs Chromium build). **SKIP** = script exists, exits 77 without its prerequisites (a skip is never a pass). **OPEN** = blocked on a user decision.

## 1. Checks that ran here (`npm run check` from the repo root)

| Check | Result | Evidence |
|---|---|---|
| TypeScript typecheck (`tsc --noEmit`, strict, `erasableSyntaxOnly`) | PASS | exit 0, no diagnostics |
| UI lint (`ui/tools/lint.mjs`): no raw hex colors, no hard-coded template text, all i18n keys exist | PASS | `lint: 46 files, 0 errors, 6 warnings` (warnings: 6 catalog keys only reachable through dynamic key construction). Negative test run by hand: a temp file with `html\`<p>Hello world</p>\`` and `"#ff00aa"` was flagged, then deleted |
| Module manifest validation (`ui/tools/validate-manifests.ts`) | PASS | `11 manifests, 0 failures` |
| npm license check (`ui/tools/check-licenses.mjs`) | PASS | `licenses: 16 packages, 0 disallowed` (all MIT / BSD-2/3 / Apache-2.0; see PATCH-PROVENANCE) |
| Unit tests (`node --test`, Node 22.22.0) | PASS | `tests 83, pass 83, fail 0` |
| Packaging logic (`tests/packaging-selftest.sh`) with a stand-in binary | PASS (logic only) | tar.gz and .deb built and inspected; `.rpm` and AppImage skipped (rpmbuild/appimagetool not installed); says nothing about a real browser |
| `extensions/preinstalled.toml`, JSON configs parse | PASS | python tomllib / json |

What the 83 tests cover: WCAG AA text contrast for every text role pair across 16 seeds x light/dark x standard/medium/high contrast, and for 9 palette variants (all pass); outline 3:1 non-text contrast at medium/high; token snapshot for 4 seeds; committed `tokens.css` equals generator output; Linux portal/gsettings/GTK/kdeglobals parsing against fixtures, provider precedence (GNOME, KDE, tiling WM with GTK theme only, nothing available) and live-update dedupe; theme resolve (manual seed beats system) and live recolor; module manifest schema + semantic rules; permission broker, denied-permission refusal, per-call gating (negative tests), unload frees listeners/timers/disposables, dependency order/cycles; layout schema, guard rails, all ops, undo/redo/reset, bounded history, debounce + restart restore, corrupted-file fallbacks (9 cases), sanitize/repair, import/export, breakpoints, drag-and-drop target math; omnibox classification; error classification, history grouping, NTP override resolution; settings model generated from manifests; stock-page table consistency; allow-list/NetLog/strace parsers; ext-compat summarizer.

## 2. Phase 1 tasks

| Task | Status |
|---|---|
| 1.1 Debrand + de-Google | UNVERIFIED. `docs/degoogle.md` work list (21 items), GN args in `build/args/linux-{release,debug}.gn`, 8 intent patches `patches/debrand/*` (header + described change, **no diff hunks**), network allow-list `docs/network-allowlist.md` (empty). Debranding itself depends on Phase 0's branding render |
| 1.2 WebUI chrome shell | UNVERIFIED. `ui/chrome/*` (Lit components, shell wiring, bridge), `src-overlay/corvid/chrome_shell/` (mojom, layout storage, BUILD.gn). **Not written:** the WebUI controller and ShellHandler implementation and the native window patch (`patches/ui/0210`, intent only) |
| 1.3 Module host + manifest + UI-mod API v0 | TS side PASS (tests above); `modules/schema/module.schema.json`, 9 builtin `module.json`, sample ui-mod `modules/examples/sample-panel` (runs in a test with DOM stand-ins). C++ permission table written, UNVERIFIED |
| 1.4 Layout engine | Logic PASS (schema, validation, persistence, reset, undo/redo, DnD math). Lit renderer `ui/layout/layout-host.ts` UNVERIFIED (no DOM test; jsdom's dependency licenses are not BSD/MIT/Apache) |
| 1.5 Theme engine + tokens | PASS (engine, tokens, contrast). M3 Expressive non-color tokens (shape scale, springs, type) are **UNVERIFIED against the spec**: values are from memory and flagged in `theme/tokens/static.ts` |
| 1.6 Linux color providers | Parsing/precedence PASS against fixtures. Real D-Bus/gsettings/file-watch transport (C++) **not written**: `src-overlay/corvid/theme/` has the Mojo contract + file allow-list only; it must reuse Chromium's existing GTK/portal code once the tree is available. libadwaita accent hex values are from memory |
| 1.7 Custom pages | UNVERIFIED rendering. 12 pages in `ui/pages/*` (newtab, settings, extensions, history, downloads, bookmarks, about, error/offline/ssl, crash, freeze, blocked, gpu). Pure logic tested. **Not written:** Mojo handler implementation and the boot glue that calls `setPageApi` |
| 1.8 Stock `chrome://` pages | UNVERIFIED. 101-host table (`ui/pages/stock-pages.json`, `docs/stock-pages.md`, C++ policy + gtest). Host list is from memory; acceptance 02 enumerates the real list |
| 1.9 MV2 + MV3 | UNVERIFIED. Intent patches `patches/extensions/0300`, `0310`; fixtures `tests/fixtures/ext/{mv2-blocking-webrequest,mv3-basic}` |
| 1.10 uBO preinstalled | OPEN (CR-1). `extensions/preinstalled.toml`: **not pinned** (version, asset, sha256, extension id are `TODO`). GitHub API/asset hosts returned 403 through the agent proxy; a page fetch reported 1.75.0 as latest with a `.chromium.crx` asset but gave no checksum, so no pin was made. Release bundling is switched off (`release_bundling_allowed = false`) |
| 1.11 NTP override | Resolution logic PASS in TS (mirrored in C++ with gtest, UNVERIFIED); hook is intent patch `patches/extensions/0330` |
| 1.12 Extension compat sweep | Skeleton only: `docs/ext-compat.md`, `tests/ext-compat/summarize.mjs` (PASS). No extension was run; the top-100 list is not curated (depends on CR-2) |
| 1.13 Linux packaging | `scripts/package.sh` + selftest PASS for tar/deb with a stand-in binary; rpm/AppImage paths unexercised. Codec GN args set per user decision |

## 3. Acceptance tests (`tests/acceptance/phase-1/`, run all with `run.sh`)

`run.sh` result here: `pass=0 fail=0 skip=13` (exit 2). Every script exits 77 (SKIP) without its prerequisites.

| # | Check | Status |
|---|---|---|
| 1 | No phone-home (NetLog + strace vs allow-list) | SKIP (needs `CORVID_BIN`, strace). Parsers/allow-list logic PASS in unit tests |
| 1b | Binary host grep | SKIP (needs `CORVID_DIR`) |
| 2 | No stock screens | SKIP (needs browser) |
| 3 | Layout move/hide/resize/restart/corrupt/reset | SKIP (browser). Same logic PASS in unit tests (`ACCEPTANCE-3 logic` test) |
| 4 | Modules: install without rebuild, denied refused, unload frees | SKIP (browser). Same logic PASS in unit tests |
| 5 | Theme follows GNOME/KDE live within 1 s; seed override wins | SKIP (needs desktop session, browser). WCAG part PASS in unit tests |
| 6 | MV2 + MV3 work and survive restart | SKIP |
| 7 | uBO blocks, removable, stays removed | SKIP; also needs the pin (TODO) and CR-1 |
| 8 | New tab override, fallback, picker | SKIP. "No flash" detection is not implemented even in the script |
| 9 | Top-100 pass rate | SKIP (target is CR-6; list not curated) |
| 10 | .deb/.rpm/AppImage install on Debian/Fedora, X11/Wayland | SKIP (needs VMs) |
| 11 | Hardware acceleration (`corvid://gpu` + `vainfo`) | SKIP (needs GPU machine, browser) |
| 12 | WebRTC works + protective defaults | SKIP (browser) |
| 13 | Codec playback | manual; no script |

## 4. User decisions folded in (2026-10-09)

- **Codecs (CR-3):** `proprietary_codecs=true`, `ffmpeg_branding="Chrome"`, HEVC/AC3/etc. args in `build/args/linux-*.gn`. Recorded in `docs/CHANGE-REQUESTS.md` as "enable all; legal check before public release", **not closed**; new CR-10 is the pre-release legal checklist item.
- **WebRTC:** default `webrtc.ip_handling_policy = default_public_interface_only`, mDNS candidates on, no built-in STUN; exposed as `corvid.privacy` settings; patch `0170` (intent), acceptance 12, binary grep for `stun.l.google.com`.
- **Hardware acceleration:** VA-API, Ozone X11+Wayland, Vulkan/ANGLE args; candidate runtime features in `build/args/linux-runtime-features.json`; `corvid://gpu` page; acceptance 11.

## 5. Everything marked UNVERIFIED, in one place

All C++/GN/Mojo under `src-overlay/corvid/`, all `patches/**` (intent only, no hunks), `build/args/*.gn` (arg names from memory; run `gn args --list` on the pinned tree), the Lit renderers and pages (no browser/DOM run), the M3 Expressive non-color token values, libadwaita accent colors, the stock `chrome://` host list, and all browser-driven acceptance scripts.

## 6. Integration notes for Phase 0

- Patch series: nothing was added to `patches/series`. `patches/series.phase1` lists the 15 patches, each prefixed `#UNVERIFIED` (disabled). Phase 0's tooling should merge it after each patch has real hunks.
- Files at the repo root that Phase 0 might also create: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`. `build/args/linux-{release,debug}.gn` may collide with Phase 0/`build-linux` too. `scripts/` only gained `package.sh`.
- `docs/CHANGE-REQUESTS.md`, `docs/PATCH-PROVENANCE.md`, `docs/specs/phase-1.md` were edited (decisions, deps, acceptance 11-13).
- Node resolve hook `ui/tools/resolve-hooks.mjs` works around `@material/material-color-utilities@0.4.0` shipping an extensionless import; production bundling is unaffected.

## 7. Questions for the user

1. CR-1: bundle unmodified uBlock Origin (GPL-3.0) in releases? Until answered it is dev-only.
2. CR-2: extension store/update source (and therefore the top-100 list source).
3. CR-6: pass-rate target (proposed 85%); `09-compat` refuses to run without `CORVID_COMPAT_TARGET`.
4. Default search engine (placeholder: DuckDuckGo), default layout (desktop-classic) and tab placement (top), is a Google/Bing entry wanted in the selectable list?
5. Widevine/DRM video: it needs a Google-hosted CDM download, which conflicts with zero Google calls. Currently off.
6. Keep the DevTools frontend reachable? (It is stock UI.)
7. Should the browser-side C++ (WebUI controllers, Mojo handlers, window patch) be done next, in a session that has a Chromium checkout?
