# webui: Corvid's internal pages

Plain TypeScript and CSS, no framework, independent of the Chromium tree. Since phase 5 the browser serves them as its own pages:

| Page | In the browser | Patch |
|---|---|---|
| new tab | `chrome://new-tab-page` (normal windows) and `chrome://newtab` (private and guest windows) | `patches/common/webui-newtab.patch` |
| settings | `corvid://preferences`, linked from Settings > Appearance | `webui-settings.patch` |
| error | net error page (renderer) and certificate interstitial (browser) | `webui-error-pages.patch` |
| diagnostics | `corvid://diagnostics` | `diagnostics.patch` |
| sync | `corvid://sync` | `sync-client.patch` |

`build/webui-sync.sh` runs `node scripts/build.mjs --chromium` and copies the result to `components/corvid_webui/dist/` in the Chromium tree (also run by `build/build.sh` before every build); the patches pack it into `resources.pak`.

## Commands
```sh
npm ci                 # once (Node 20+)
npm run dev            # http://127.0.0.1:8077/ , rebuilds when src/ changes (--port, --host)
npm test               # unit tests (node:test)
npm run typecheck
npm run render-check   # every page in a real browser at 360, 768 and 1440 px, light and dark
npm run check          # all of the above
npm run browser-check  # the pages inside the real Corvid build (needs the patched browser; see below)
node scripts/build.mjs --chromium DIR   # files for the browser (build/webui-sync.sh does this)
```
`browser-check` (`scripts/browser-check.mjs`, checks: `newtab settings errors accent diagnostics hang private`, default all) starts the patched browser on fresh profiles and checks: new tab and private new tab are ours; prefs saved in the profile, kept across a restart and pushed live to other open pages; the Settings entry; error pages for an unknown host, a refused connection and a self-signed certificate (with "continue"); the desktop accent (stock GTK theme, a red GTK theme, an accent from a fake xdg-desktop-portal, and a live portal change; checks the page colours and the browser frame colour from screenshots); each diagnostics event. `accent` and `hang` need X: they use `DISPLAY` or start Xvfb. Needs `openssl`, `xdotool`, ImageMagick `import`, `dbus-daemon`, `python3-dbus` and `python3-gi` (all in `build/deps.sh`).
`render-check` uses `CORVID_BROWSER`, else `/work/src/out/Default/corvid`, else `/usr/bin/chromium`. Screenshots land in `render-out/` (git-ignored). It fails on console errors (CSP violations included), sideways scrolling, elements past the right edge, empty or unfilled strings, and broken interactions (theme, engine, density, shortcuts, SSL "continue" rules, live updates between pages).

## Layout
- `src/color/`: `contrast.ts` (WCAG ratio and AA check), `engine.ts` (seed colour to a full Material 3 palette; light/dark; standard/medium/high contrast; calm/expressive/vibrant/neutral styles; every text pair checked against AA and nudged if short).
- `src/tokens/tokens.ts`: Material 3 Expressive shape, type, spacing, density and motion tokens. Springs become CSS `linear()` easings.
- `src/strings/en.ts`: the one string catalog. Sentence case, plain words, `{placeholders}`. The product name is never written there: `{product}` comes from `build/branding.conf` at build time.
- `src/shared/`: prefs store (profile prefs in the browser, localStorage on the dev server), theme application (incl. the desktop accent colour), search engines and address-or-search logic, error page model, diagnostics model, DOM helpers.
- `src/shared/bridge.ts`: the only place that talks to the browser. The browser serves `corvid-init.js` (`window.corvidInit`: prefs, accent, read-only in private windows) before the page script, takes `chrome.send('corvidReady' | 'corvidSetPrefs' | 'corvidGetDiagnostics' | 'corvidClearDiagnostics')`, and calls back `corvidBrowser.dispatch('prefs' | 'accent' | 'diagnostics', value)`. The error page instead gets `window.corvidErrorInfo` inlined and uses Chromium's `errorPageController` / `certificateErrorPageController`.
- `src/pages/{newtab,settings,error,diagnostics,sync}/`: the pages. Sync page dev samples: `?state=off|waiting|on|pairing|revoked|problem`. Error page input: `?code=ERR_...&url=...&info=<JSON>` or `window.corvidErrorInfo`; dev samples with `?sample=dns|offline|connection|timeout|ssl|ssl-hsts|blocked|generic`.
- `scripts/`: `build.mjs` (esbuild; generates `tokens.css` and the default theme CSS for first paint; `--chromium` for the browser: minified, error page inlined into one file), `serve.mjs`, `render-check.mjs`, `browser-check.mjs`, `fake-portal.py` (stand-in xdg-desktop-portal for the accent check).

## Rules the code follows
- No `innerHTML` with data; all text goes through `textContent`.
- No inline scripts or styles in markup (works under a strict CSP; the dev server sends one).
- No network requests: no web fonts, no favicons for shortcuts (monograms instead).
- Motion respects `prefers-reduced-motion`; nothing animates on load.

## Third-party code
`@material/material-color-utilities` (Apache-2.0, Google), bundled into the page scripts with its licence header kept. It is the same colour algorithm Chromium uses, with the 2025 (Material 3 Expressive) spec.
