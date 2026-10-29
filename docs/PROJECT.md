# Corvid: what the project is

Corvid is a web browser for people who want a modern, good-looking, fast browser that answers to them and not to an advertising company. It is built on Chromium, so websites behave the way they do in Chrome and Edge, but everything that talks to Google or reports on the user is removed, and almost everything the user sees can be rearranged, restyled and replaced.

"Corvid" is a codename. The name lives in one place so it can be changed before any public release.

This document describes the product: what it is, what it stands for, and everything it should do. It does not say how it is built. For status and plans see `docs/STATUS.md` and `docs/ROADMAP.md`. Parts that are not decided are collected in the last section as open questions.

---

## 1. In one paragraph

Corvid is a Chromium-based browser with the feature richness of Edge, the independence of Brave and the quiet minimalism of Helium. It has no telemetry and no Google services, keeps the full extension system (including the older Manifest V2 that Chrome is dropping) with uBlock Origin installed from the start, looks and feels like Material You 3 Expressive (rounded, airy, colourful in a calm way), lets the user move and hide nearly every piece of the interface, and comes with built-in tools for understanding what the browser and the web are doing: a diagnostics hub, readable error pages and enhanced developer tools. It runs on Linux, Windows and Android, and can sync between devices through a server the user hosts themselves, with end-to-end encryption.

## 2. Who it is for

- People who want Chrome's compatibility without Google's tracking, and who do not want to give up daily-driver conveniences to get that (passkeys, DRM video, payments, hardware acceleration, good extensions).
- People who care how their browser looks, and who want it to follow their system colours and be customizable instead of fixed.
- People who run their own services (homelab, self-hosting) and want their browser data to live on their own server.
- People who are curious about what is going on when a page hangs, a connection fails or a certificate is wrong, and who are tired of "Aw, Snap!" pages that say nothing.

The first and most demanding user is the project owner, who intends to use it as a daily driver. "Stable first" beats "feature complete but flaky".

## 3. Principles

1. **Chromium only.** One engine. No Firefox/Gecko backend and no per-tab engine switching. Web compatibility is a feature we inherit and protect.
2. **Private by default, and provable.** Zero telemetry. An idle browser in a fresh profile contacts nothing. This is checked with a network capture, not assumed.
3. **No Google, as far as possible, without making the browser worse to use.** Google services are removed or neutralized; features people depend on (passkeys, payments, DRM, sync) get non-Google equivalents or work without Google.
4. **The user is in charge.** Layout, theme, density, search engine, extension sources, privacy settings and update source are the user's to change. Nothing is hard-wired where a setting could exist.
5. **Modular.** Every feature is a module that can be turned off, moved or replaced. People can install layouts, themes and panels without rebuilding the browser.
6. **Looks modern, stays calm.** Rounded shapes, generous space, few controls visible at once, nothing cramped, nothing flashy.
7. **Honest and plain.** Plain-language text in the interface and in errors, with technical detail one step down for people who want it. Nothing is reported as working until it was tested.
8. **Small footprint on upstream.** The browser tracks Chromium stable. Changes to Chromium are kept few and small so that updates stay cheap and security fixes arrive quickly.
9. **Open and copyleft.** GPL-3.0-or-later (decided 2026-10-29: the base, Helium, is GPL-3.0). Bundled third-party pieces keep their own licences and are credited.

## 4. What it should do

### 4.1 Privacy and independence from Google

- No telemetry, usage statistics, field trials or experiments. Crash and diagnostic data stay on the machine.
- All Google services removed or neutralized: sign-in, Chrome sync, Safe Browsing lookups, search suggestions to Google, variations, metrics, component and update endpoints, promo and "what's new" pages, spelling and translation backends that call Google, and similar.
- **Privacy gate.** A clean profile left idle for 15 minutes must make zero network connections to anything not listed in the network allow-list (`docs/network-allowlist.md`). The list starts empty and a host is added only with the owner's explicit approval. Compiled-in Google hostnames are rewritten so that they cannot resolve.
- User-initiated traffic is separate: pages the user opens, extension updates from the store the user chose, and features the user explicitly clicks.
- Default search engine: DuckDuckGo (a placeholder), with a configurable list of engines.
- **WebRTC works fully**, with a privacy-respecting default for IP exposure (public interface only, mDNS host candidates), exposed as a setting. No built-in STUN server.
- Passkey features that rely on Google or Apple relays (phone-as-authenticator over the cloud tunnel) work only when the user clicks "use your phone", are never contacted at idle, can be turned off, and the interface says what that does.
- Extension stores are configurable (see 4.4). Default: Chrome Web Store and Microsoft Edge Add-ons, plus any store URL the user adds, plus manual install from file or folder.

### 4.2 Interface and design

**Direction.** Material You 3 Expressive: rounded shapes, tonal colour from one palette, short spring-like motion. Edge-level polish with Helium-level restraint, but airier than either. It should feel modern and friendly, not technical.

**What it must not look like.** Sharp-cornered or old-style chrome; Arc, Vivaldi, Brave or Firefox looks; Chrome's rigidity where almost nothing can be changed.

**Colour and theming.**
- One shared colour engine produces the whole palette from a seed colour. Light, dark and automatic modes; standard, medium and high contrast.
- The seed can come from the system: Android dynamic colour (Material You), the GTK/libadwaita accent and scheme on Linux (GNOME and KDE, GTK 3 and 4), or the Windows accent colour. It updates live when the system changes.
- The user can override with a chosen colour or one taken from a wallpaper.
- Text colours meet WCAG AA contrast.

**Shape, type, space.**
- Corner radii from small to fully round; large radii on chrome surfaces; shapes can animate on state but never become square.
- System UI font by default, with a monospace companion for diagnostics.
- Three densities (comfortable by default, compact, spacious) that scale spacing and control size together.
- Motion respects reduced-motion settings; page content never animates on load.

**Layout and customization.**
- The browser chrome (tabs, toolbar, address bar, side panels) is meant to be built from movable parts: drag, drop, hide, resize, save as a layout, share a layout.
- The address bar can sit at the top or bottom, on desktop and Android. Some things can never be removed: the address bar, access to tabs, and a "reset layout" button, so no one can lock themselves out of their own browser.
- Tabs: horizontal or vertical. A vertical tab rail on the left is the modern default in the design; horizontal is available. Collapsing the rail to icons is wanted.
- Presets ship in the box: a vertical-tabs desktop layout, a classic top-tabs layout, a compact single-row layout, and a touch layout for phones. Narrow windows switch to the touch layout.
- A public UI-mod API lets people install layouts, themes and panels without rebuilding the browser.

**Internal pages.** Everything the user can see inside the browser is custom and matches the design: new tab, settings, extensions, history, downloads, bookmarks, and all error, crash, freeze, SSL, offline and "blocked" pages. No stock Chromium screen should be reachable from normal use.

**Internal-page content.** Plain-language summary first, technical detail below. Sentence case, no jargon in headlines. All user-visible text lives in one string catalog so the interface can be translated.

### 4.3 Diagnostics and developer tools

Corvid treats "why did that happen?" as a core feature.

- **Diagnostics hub.** A page with a live timeline per tab of CPU, memory and hangs; a freeze detector that records what the page was doing when it hung; filterable, verbose, structured logs; and export of everything as local files.
- **Verbose error pages.** A failed page shows a plain-language explanation on top and, below, the details: DNS resolver and answers, certificate chain and why it failed, timings, retry history.
- **Local-only data.** Events (hangs, crashes, network, TLS, DNS, console errors, memory) go to a local ring buffer. Nothing is sent anywhere.
- **Enhanced DevTools.** DevTools stays fully available. Additions: a verbose console mode, a performance overlay, and hang reports linked from DevTools.

### 4.4 Extensions

- **Manifest V2 and V3 both.** The older MV2 extension model is kept, with blocking `webRequest`, because extensions like uBlock Origin depend on it. MV3 works as well.
- **All extension types**, including themes, new-tab replacements, devtools extensions and side-panel extensions.
- **uBlock Origin (full, MV2) is preinstalled, enabled by default and updatable.** It is bundled unmodified as a separate extension, and its licence (GPL-3.0) and source link are shown in the credits.
- **New-tab override.** Extensions can replace the new tab page; Corvid's own page is the fallback.
- **Configurable sources.** Chrome Web Store, Edge Add-ons, other Chromium-style stores, `.crx`/`.zip` files and unpacked folders.
- **Compatibility is measured.** A list of the top 100 extensions is tested on each platform and the results recorded. Targets: 85% on desktop, 80% on Android, with new-tab overrides, password managers and ad blockers as must-pass categories.
- **Android gets the full desktop extension stack**, including background pages and service workers, touch-friendly extension management and per-extension permissions. This is the hardest single piece of the project. If uBlock Origin is too heavy on Android, a built-in native blocker is the fallback, decided by measurement.

### 4.5 Passkeys and credentials

- **Built-in passkey authenticator** (software, encrypted at rest with a key the user controls) so passkeys work on every platform, which matters most on Linux where there is no OS passkey store.
- **OS authenticators** where they exist: Windows Hello on Windows; Android Credential Manager on Android (with the Corvid vault selectable as a credential provider).
- Hardware security keys, discoverable credentials and, on explicit user action, phone-as-authenticator.
- A vault interface to view, import and export credentials. Export hides secrets by default. Vault unlock defaults to the OS keyring.
- Google's own password-manager enclave and background phone discovery are off.
- Passwords and one-time codes use the browser's built-in password manager and keep working with sync off.

### 4.6 Sync (self-hosted)

- A small server the user runs themselves: Docker, Proxmox LXC or bare metal, as one static binary, SQLite by default (Postgres later). No public reference instance. Registration is by token by default.
- **End-to-end encrypted.** Keys exist only on the user's devices; the server sees ciphertext and nothing it can read. A new device is approved from a trusted device (with a comparison code) or with a recovery key. There is no copy of the key wrapped by a passphrase on the server.
- Syncs: bookmarks, passwords, passkeys, settings, themes, layouts and modules, extension list and settings, and history (on by default, can be turned off). Open tabs are optional and off by default. Cookies never sync.
- Works offline and converges afterwards. Revoked devices lose access. Wrong keys or tampered data are rejected and reported, never silently applied.
- Optional admin page on the server that shows metadata only and cannot approve devices.
- Sync arrives after the first desktop releases (see 6).

### 4.7 Media, web platform and performance

- Full hardware acceleration on Linux: video decode and encode through VA-API, GPU rasterization, WebGL and WebGPU, on both X11 and Wayland.
- Proprietary codecs (H.264, HEVC, AAC and others) enabled where hardware supports them. This depends on a legal check before any public release.
- DRM video must work. This needs a Widevine licence arrangement that is not settled (see open questions). It is requested by the user on first use, never contacted at idle.
- Payments and autofill keep working as in stock Chromium, minus Google endpoints; Google Pay in particular will not work.

### 4.8 Updates and distribution

- Corvid never contacts an update server by default. The update source is configured by the user or the distributor.
- Updates (on Windows and wherever Corvid ships its own updater) are signed, verifiable offline, protected against replay and downgrade, and roll back automatically if a new version does not start healthy. No always-running background service and no data sent about the installed version.
- Linux: tarball, `.deb`, `.rpm`, AppImage. Windows: installer (per-user and per-machine), default-browser registration, clean uninstall. Android: APK from GitHub Releases first; a self-hosted F-Droid-style repo and Play Store later or maybe.

## 5. Platforms

| Platform | Status in the plan | Notes |
|---|---|---|
| Linux (x64) | First | Fedora and Debian/Ubuntu families; X11 and Wayland; GNOME and KDE accent integration. |
| Windows 10/11 (x64) | Second | Installer, own updater, Windows accent colour, Windows Hello, custom title bar with snap layouts, high contrast and 200% scaling. Arm64 undecided. |
| Android 12+ | Third | Touch layout with bottom toolbar, dynamic colour, full extension stack, Credential Manager passkeys, arm64 and armhf. Older Android down to API 26 may run with the seed colour only. |
| macOS | Dropped for now | No Apple developer account. Parked; can be reconsidered. |
| iOS | Not planned | |

## 6. Releases and milestones

**Corvid 0.1** is Linux, Windows and Android (decided 2026-10-14), in that order. As a release it is complete only when all three pass their checks. The first Linux build is the first target.

What the first Linux build is meant to contain:
- Chromium 155 rebranded as Corvid and stripped of Google services, with the idle-network privacy gate passing.
- Corvid theme and colour engine (including GTK accent following), Corvid internal pages in place of stock ones, side-panel entries, optional vertical tabs, stock menu items hidden. The browser frame itself is still Chromium's native window.
- uBlock Origin preinstalled, MV2 and MV3 both working, new-tab override.
- Diagnostics event collection, structured error events and the diagnostics service (hang detection without a stack trace at first).
- Corvid branding (name, icons) and a Linux package.

Deliberately later, even though it is part of the full vision:
- **Corvid 0.2 (next):** built-in passkeys and the custom WebUI browser shell with free drag-and-drop layout of the chrome itself. Until then, customization means theme, density, Corvid pages, side panels and extensions; sites that offer passkeys use hardware keys or whatever Chromium does without an authenticator.
- Hang stack capture inside the renderer.
- **Windows:** installer, updater, Windows accent and Hello.
- **Self-hosted sync** server and client.
- **Android:** the full app, with the extension stack.

Every phase ends with acceptance checks that must be run and shown to pass before the next phase starts. A check that was not run is reported as skipped, never as passed.

## 7. What Corvid is not

- Not a Firefox or WebKit browser, and not a multi-engine browser.
- Not a copy of Brave, Vivaldi, Arc or Firefox in look or in feature philosophy.
- Not a telemetry-gathering product.
- Not a browser that removes older extension support because upstream did.

## 8. Open questions

These are not decided. Each one needs the project owner.

**Release and legal**
1. Name: is "Corvid" the real name? Trademark and domain check is required before any public release.
2. Codecs: the owner wants all codecs enabled, but patent and licensing exposure for distributed builds needs a legal check.
3. Widevine: the owner requires DRM video; the legal basis for a non-Google browser to obtain and use the CDM is not settled.
4. Should 0.1 ship without built-in passkeys (hardware keys only) and add them in 0.2, or wait until passkeys work? The current recommendation is to ship what is stable and do passkeys first in 0.2.
5. Code signing certificate and distribution channels for Windows (installer download, winget, others), and whether Windows arm64 is supported.
6. Android signing-key plan, and whether the minimum version is Android 8 (API 26) or 12 (API 31).

**Design**
7. Default colour and typeface. Currently a muted blue-violet seed (`#5B6BC0`) and the system font are placeholders until the owner picks.
8. Default density (comfortable is assumed) and whether vertical tabs or horizontal tabs are the default for 0.1 (the current stance is horizontal, with vertical optional).
9. How the custom browser shell is built (research note exists; choice is the owner's) and how much of the layout editing ships in 0.2 versus later.
10. The final look of the diagnostics hub (data-dense pages versus the airy general style).

**Features**
11. Payments and Google Pay alternatives: how far should payments go beyond "stock Chromium without Google endpoints"?
12. Whether a native ad blocker is built in alongside uBlock Origin on desktop, or only as the Android fallback.
13. Whether history and open tabs should sync by default (history is on, tabs off, per the current decision).
14. Update server: who hosts it, and whether Linux gets an updater or relies on the distribution's package manager.
15. Whether macOS returns after an Apple developer account exists.

**Ongoing**
16. MV2 is gone upstream, so keeping it is permanent maintenance. How long to commit to it is an open question.
17. Which Chromium channel to follow and how quickly: the plan is stable with a weekly upstream check; the acceptable lag after security releases is not set.
