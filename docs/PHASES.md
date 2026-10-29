# Phases

Each phase ends with a prompt for a fresh agent. Open a new session, paste only the prompt. Agents read `AGENTS.md`, `docs/PROJECT.md`, `docs/STATUS.md` themselves. Phases 2, 3 and 4 can run at the same time while the phase 1 build runs.

Order: 0 (done) > 1 > {2, 3, 4} > 5 > 6 > 7 > 8 > 9.

## Phase 0: decisions and skeleton (DONE, see `docs/decisions/001-base.md`)
Licence decided: whole project GPL-3.0-or-later.

## Phase 1: VM prep and first Linux build (hours, mostly waiting)
Grow the VM disk to 400 GB, install build dependencies, fetch the Chromium version Helium tracks, apply Helium's patches, configure a component build with ccache, build in tmux.
Done when: a Helium-based binary launches on Linux; build time, disk use and exact args recorded in STATUS.md.
```text
PHASE 1. On this Linux VM (20 vCPU Westmere, 96 GB RAM, no AVX: confirm the build tools run) build the Helium base for Linux. Read docs/decisions/001-base.md. Follow Helium's Linux packaging docs (imputnet/helium-linux and imputnet/helium-macos docs/building.md, clone them). Put re-runnable scripts in build/ (fetch, apply patches, configure, build). Args: component build, symbol_level=0, no LTO, ccache with a persistent dir, ninja -j 22. Run the long build in tmux, log to build/logs/. When done launch the binary and record version, build time, disk used. If a step fails twice, write the error and your hypothesis in STATUS.md and stop.
```

## Phase 2: patch workflow, branding, privacy gate
Our series applies after Helium's; `build/refresh-patches.sh` regenerates patches from a working tree; rebrand to Corvid from one config; idle-network test against `docs/network-allowlist.md` (starts empty).
Done when: the rebuilt browser says Corvid and `build/privacy-gate.sh` passes or lists exactly what it saw.
```text
PHASE 2. Starting from the phase 1 build: (1) make a patch workflow where patches in patches/common and patches/linux apply on top of Helium's series, plus build/refresh-patches.sh that regenerates them from a working tree; (2) rebrand to "Corvid" with the name in one config (placeholder icons ok); (3) write build/privacy-gate.sh: fresh profile, idle 15 min, capture all outbound connections, compare with docs/network-allowlist.md (starts empty). Fix leaks with small patches. Show me the capture summary.
```

## Phase 3: shared WebUI pages (independent of Chromium)
Plain TypeScript and CSS: tokens, colour engine, string catalog, new tab, settings, error/offline/SSL pages, responsive from phone to desktop.
Done when: tests green, pages render at phone and desktop widths.
```text
PHASE 3 (webui/ only, independent of Chromium; do not touch patches/ or build/). Build the Corvid internal pages as plain TypeScript and CSS that can later run inside a Chromium WebUI page: Material You 3 Expressive tokens, a colour engine (seed to palette, light/dark, contrast levels, WCAG AA check), one string catalog, and pages: new tab, settings (search engine, theme, density), error/offline/SSL with plain-language summary and technical detail below. Responsive from phone to desktop. Tests and a dev server included.
```

## Phase 4: sync, starting from what Helium already has (independent of the compile)
Helium's series has a sync vault engine (`patches/helium/core/sync/`). First learn exactly what exists and what server it speaks to, then decide: reuse its vault format with our own self-hosted server, or write our own protocol.
Done when: `sync/protocol/SPEC.md` exists, a server binary runs, and two simulated devices converge after offline edits; tampered data and wrong keys are rejected.
```text
PHASE 4 (sync/ only). Section 4.6 of docs/PROJECT.md is the goal. Step 1: read Helium's sync patches (clone imputnet/helium-chromium, patches/helium/core/sync/ and settings/sync-setup-contract.patch) and imputnet/helium-services; write docs/decisions/002-sync.md (<=20 lines): what the vault format, encryption and transport are, what server it expects, whether it works end to end, and a recommendation (reuse the format and write a compatible self-hosted server, or own protocol). Step 2: write sync/protocol/SPEC.md (<=3 pages) and implement sync/server in Go with SQLite as one static binary, token registration, Dockerfile, plus a reference client library with test vectors. Tests: two devices converge after offline edits; tampered data and wrong keys are rejected and reported; a revoked device loses access.
```

## Phase 5: integrate WebUI and diagnostics into Chromium (Linux)
Needs phases 2 and 3. Register Corvid WebUI pages, replace the stock new tab and error pages, theme following the GTK accent, local-only diagnostics ring buffer.
Done when: no stock page is reachable in normal use and the privacy gate still passes.
```text
PHASE 5. Phases 2 and 3 are done. Integrate webui/ into Chromium as WebUI pages with small patches (patches/common): new tab, settings entry, error/offline/SSL pages. Add theme and colour following the GTK accent on Linux (patches/linux). Add a local-only diagnostics ring buffer (hangs, crashes, network/TLS errors) and a basic diagnostics page. One patch per feature, rebuild and test each. Re-run build/privacy-gate.sh at the end and list what remains stock.
```

## Phase 6: extensions, uBlock Origin, MV2
Check what Helium does (it forks uBO) against PROJECT.md (unmodified upstream uBO). Verify MV2 runs in Chromium 156.
Done when: uBO blocks ads on a test page on a clean profile; extension compatibility test runs and is recorded in `docs/extension-compat.md`.
```text
PHASE 6. Verify what Helium already does for MV2 and uBlock Origin (docs/decisions/001-base.md), actually run an MV2 extension, then fill the gaps: MV2 and MV3 both working, unmodified upstream uBO preinstalled and updatable (GPL credits in the credits page) or, if you recommend keeping Helium's fork, write docs/decisions/003-ubo.md first; new-tab override extensions; configurable stores (Chrome Web Store, Edge Add-ons, custom URL, file/folder). Write build/test-extensions.sh installing 20 popular extensions and recording pass/fail in docs/extension-compat.md. Show results.
```

## Phase 7: sync client in Chromium (Linux)
Adapt Helium's engine to our server (or implement ours per decision 002). Bookmarks first, then settings, history, passwords, plus a pairing/recovery-key page.
Done when: two Linux profiles stay in sync through our server, offline edits included.
```text
PHASE 7. Read docs/decisions/002-sync.md and sync/protocol/SPEC.md. Make the Chromium side talk to sync/server with the smallest possible patches (patches/common), logic in a separate component with unit tests. Start with bookmarks, then settings, history, passwords. Add a pairing and recovery-key WebUI page. Test: two profiles on this VM converge through the server, including offline edits. Record any protocol change in SPEC.md.
```

## Phase 8: Windows
Windows VM on Proxmox or a CI runner; installer, default-browser registration, accent colour, title bar.
Done when: an installer runs on Windows 10/11 and passes the privacy gate and extension test.
```text
PHASE 8. Windows x64. Read imputnet/helium-windows and set up a Windows build (a Windows VM or runner; document what it needs). Add patches/windows (accent colour, title bar), installer, default-browser registration. Run the privacy gate and the phase 6 extension test on Windows. Add ci/ workflows for the Windows job. Report disk and time needs.
```

## Phase 9: Android and releases
Decide the Android base (Cromite, ungoogled-chromium-android, or other), set up the build on Linux with more disk, port sync, release builds on CI.
Done when: a debug APK runs against the same sync server and the privacy gate passes on Android.
```text
PHASE 9. Android arm64. First write docs/decisions/004-android.md: compare Cromite and ungoogled-chromium-android (licence, Chromium version, activity, extension support, rebase effort versus our Helium-based desktop patches) and recommend. Then set up the Android build on Linux (disk and time estimates first), apply branding and privacy patches, reuse webui/ where possible, port the sync client, sign debug APKs. Run the privacy gate on an emulator or device. Be honest in STATUS.md about the extension stack: say what runs and what does not.
```
