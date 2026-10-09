# Phase 1 spec: Linux MVP

Goal: a daily-drivable Linux browser: zero Google, custom WebUI chrome, modular and rearrangeable, M3 Expressive theming following GTK/KDE, custom internal pages, MV2+MV3 with uBO preinstalled, new-tab extensions.

## Tasks
| ID | Task | Skill | Key paths |
|---|---|---|---|
| 1.1 | Debrand + de-Google, with network verification | `debrand-and-degoogle` | `patches/debrand/`, `docs/degoogle.md`, `docs/network-allowlist.md` |
| 1.2 | WebUI chrome shell (tab strip, toolbar, address bar, side panel host) in a native window | `add-webui-page`, `module-manifest` | `ui/chrome/`, `src-overlay/corvid/chrome_shell/` |
| 1.3 | Module host + manifest schema + UI-mod API v0 | `module-manifest` | `modules/`, `modules/schema/`, `src-overlay/corvid/modules/` |
| 1.4 | Layout engine with edit mode, persistence, reset | `layout-engine` | `ui/layout/` |
| 1.5 | Theme engine + tokens | `theme-m3e` | `theme/engine/`, `theme/tokens/` |
| 1.6 | Linux color providers (portal, GTK 3/4, KDE) | `platform-color-provider` | `theme/providers/linux/` |
| 1.7 | Custom pages: new tab, settings, extensions, history, downloads, bookmarks, about, all error/offline/SSL/crash pages | `add-webui-page` | `ui/pages/*` |
| 1.8 | Block/replace every stock `chrome://` page | `add-webui-page` | `docs/stock-pages.md` |
| 1.9 | MV2 + MV3 coexistence | `mv2-maintenance` | `patches/extensions/` |
| 1.10 | uBlock Origin preinstalled | `preinstall-extension` | `extensions/preinstalled.toml` |
| 1.11 | New-tab extension override | `ntp-extension-override` | hook patch + `ui/pages/newtab` |
| 1.12 | Extension compatibility sweep | - | `docs/ext-compat.md`, `tests/ext-compat/` |
| 1.13 | Linux packaging | `build-linux` | `scripts/package.sh` |

## Order
1.1 first (everything else builds on a clean base). Then 1.2 -> 1.3 -> 1.4 in series. 1.5/1.6 in parallel with 1.2-1.4. 1.7/1.8 after 1.3. 1.9 -> 1.10 -> 1.11 -> 1.12 in series. 1.13 last.

## Acceptance tests (`tests/acceptance/phase-1/`)
1. **No phone-home:** clean profile, idle 15 min, packet capture: every connection is in the allow-list (initially empty). Fails the phase if not.
2. **No stock screens:** script visits a list of all known `chrome://` URLs; each shows a Corvid page, redirect, or "blocked" page, never stock UI.
3. **Layout:** automated UI test moves tab strip top -> left, hides the bookmarks bar, resizes the side panel, restarts; layout restored. "Reset layout" restores default from a deliberately corrupted layout file.
4. **Modules:** a sample ui-mod (custom panel) installs without a rebuild; denied permission is refused; unload frees resources.
5. **Theme:** change GNOME accent color (portal) and toggle dark mode; Corvid recolors within 1 s without restart. Repeat on KDE. Manual seed override wins over system. WCAG AA contrast tests pass for all text roles.
6. **Extensions:** MV2 test extension (blocking webRequest, persistent background) and MV3 test extension both work and survive restart; no deprecation warnings.
7. **uBO:** fresh profile has uBO enabled; on a local ad test page it blocks known ad/tracker requests; can be disabled/removed and stays removed.
8. **New tab:** a test extension overriding new tab loads without flash; fallback works; picker works with two extensions.
9. **Compat:** top-100 extension list run recorded; pass rate >= target set by the user (ask; propose 85%).
10. **Install:** `.deb`/`.rpm`/AppImage install and launch on Fedora and Debian/Ubuntu VMs, X11 and Wayland.

## Ask the user at these points
- Default layout choice and tab placement default.
- Default search engine list and extension store source (Chrome Web Store use from a non-Chrome browser has terms-of-service implications; offer configurable sources).
- Proprietary codec policy.
- uBO license decision.
