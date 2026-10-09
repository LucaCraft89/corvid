# Corvid: agent entry point

Corvid is a modular, fully customizable Chromium-fork browser (codename; the name lives only in `branding/config.toml`). Mix of Edge (features), Brave (patch-series fork, MV2 kept) and Helium (zero Google, minimal chrome).

Read this file first. Then read `docs/ROADMAP.md` for the current phase. Load a skill from `skills/` only when its task comes up. Do not read all skills up front.

## Locked decisions (do not re-litigate; propose changes in `docs/CHANGE-REQUESTS.md`)

| Area | Decision |
|---|---|
| Engine | Chromium only. No Gecko/Firefox backend, no per-tab engine switching. |
| Foundation | Patch series on top of upstream Chromium stable (Brave/Helium style). Never commit a modified Chromium tree; commit patches + scripts. |
| Platforms | Order: Linux -> Windows -> Android. macOS dropped (2026-10-09, no Apple Developer account); parked, revisit via `docs/CHANGE-REQUESTS.md`. No iOS. |
| Browser UI | WebUI-based chrome (toolbar, tabs, sidebars, panels) with a layout engine; everything movable and reorganizable. Native window shell only. |
| Modularity | Internal module system: every feature is a module with a manifest. Public UI-mod API so users install layouts/themes/panels without rebuilding. |
| Theming | Material You 3 Expressive. One shared tonal-palette engine fed by: Android dynamic color, Linux GTK/libadwaita accent + scheme (GTK 3/4, GNOME + KDE), Windows system accent. User override via seed color or wallpaper. |
| Internal pages | All custom: new tab, settings, extensions, errors, crash, freeze, SSL, offline, downloads, history. No stock Chromium screens visible to users. |
| Extensions | Manifest V2 and V3 both. Works on all platforms including Android (full desktop extension stack ported). All extension types. New-tab override extensions supported. |
| Ad blocking | uBlock Origin (full, MV2) preinstalled and enabled by default. Native blocker fallback considered for Android performance. |
| Passkeys | OS authenticators (Windows Hello, Android Credential Manager) + built-in encrypted software authenticator (required on Linux). Hardware keys and phone-as-authenticator supported. |
| Sync | Self-hostable end-to-end-encrypted sync server (bookmarks, passwords, passkeys, settings, UI layout). Phase 4. |
| Diagnostics | Built-in diagnostics hub (live per-tab CPU/memory/hang timeline, freeze detector with stack capture, verbose structured error pages with DNS/TLS/network detail, exportable local logs) + enhanced DevTools (verbose console, perf overlay). |
| Privacy | Zero telemetry. All Google services stripped. Local-only crash/diagnostic data. Extension sources configurable. |
| License | BSD-3-Clause (match Chromium). Verify license compatibility before reusing any Helium/Brave/ungoogled patch; record it in `docs/PATCH-PROVENANCE.md`. |

## Repo layout

```
corvid/
  AGENTS.md
  branding/config.toml        # name, ids, icons: single rename point
  docs/                       # ROADMAP, CHANGE-REQUESTS, PATCH-PROVENANCE, specs per phase
  patches/                    # ordered quilt-style series, grouped by area
  src-overlay/                # new files added to the Chromium tree (WebUI, modules)
  modules/                    # browser feature modules (each has module.json)
  ui/                         # WebUI chrome source (TypeScript, Lit/web components)
  theme/                      # M3E tonal engine + per-platform color providers
  server/sync/                # self-hosted E2EE sync server (phase 4)
  scripts/                    # fetch, apply-patches, build, rebase, package
  skills/<name>/SKILL.md      # recurring task playbooks
```

## Working rules (token saving)

1. Prefer a skill over improvising. If a task matches a skill, load only that skill.
2. Patch hygiene: smallest possible patch, one concern per patch, numbered by series, each with a header (purpose, files, rebase risk).
3. Prefer `src-overlay/` (new files) over patching existing Chromium files. Every patch to an existing file raises rebase cost.
4. Never read whole Chromium directories. Use targeted grep or code search, and record findings in `docs/notes/` so they are not re-derived.
5. Each task ends with: build passes, relevant tests pass, patch series applies cleanly on a fresh checkout, and the phase acceptance checks still hold.
6. Ask the user before: changing a locked decision, adding a dependency with a non-BSD/MIT/Apache license, anything affecting privacy/telemetry, anything that cannot be undone.
7. Keep user-visible strings in one i18n catalog. No hard-coded strings in UI code.

## Skills index (create in `skills/`)

`bootstrap-build-host`, `fetch-and-apply-patches`, `rebase-chromium`, `add-patch`, `add-webui-page`, `module-manifest`, `layout-engine`, `theme-m3e`, `platform-color-provider`, `debrand-and-degoogle`, `mv2-maintenance`, `preinstall-extension`, `ntp-extension-override`, `passkey-authenticator`, `diagnostics-event`, `devtools-extension`, `build-linux`, `build-windows`, `build-android`, `build-mac`, `android-extensions-port`, `sync-server`, `package-release`, `verify-phase`. All 24 exist in `skills/`; phase specs are in `docs/specs/phase-N.md`; open decisions are in `docs/CHANGE-REQUESTS.md`.
