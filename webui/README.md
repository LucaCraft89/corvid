# webui: Corvid's internal pages

Plain TypeScript and CSS, no framework, independent of the Chromium tree. Phase 5 wires these pages into Chromium as WebUI pages (`corvid://newtab`, `corvid://settings`, error pages).

## Commands
```sh
npm ci                 # once (Node 20+)
npm run dev            # http://127.0.0.1:8077/ , rebuilds when src/ changes (--port, --host)
npm test               # unit tests (node:test)
npm run typecheck
npm run render-check   # every page in a real browser at 360, 768 and 1440 px, light and dark
npm run check          # all of the above
```
`render-check` uses `CORVID_BROWSER`, else `/work/src/out/Default/corvid`, else `/usr/bin/chromium`. Screenshots land in `render-out/` (git-ignored). It fails on console errors (CSP violations included), sideways scrolling, elements past the right edge, empty or unfilled strings, and broken interactions (theme, engine, density, shortcuts, SSL "continue" rules, live updates between pages).

## Layout
- `src/color/`: `contrast.ts` (WCAG ratio and AA check), `engine.ts` (seed colour to a full Material 3 palette; light/dark; standard/medium/high contrast; calm/expressive/vibrant/neutral styles; every text pair checked against AA and nudged if short).
- `src/tokens/tokens.ts`: Material 3 Expressive shape, type, spacing, density and motion tokens. Springs become CSS `linear()` easings.
- `src/strings/en.ts`: the one string catalog. Sentence case, plain words, `{placeholders}`. The product name is never written there: `{product}` comes from `build/branding.conf` at build time.
- `src/shared/`: prefs store (localStorage now, browser prefs in phase 5), theme application, search engines and address-or-search logic, error page model, DOM helpers.
- `src/pages/{newtab,settings,error}/`: the pages. Error page input: `?code=ERR_...&url=...&info=<JSON>` or `window.corvidErrorInfo`; dev samples with `?sample=dns|offline|connection|timeout|ssl|ssl-hsts|blocked|generic`.
- `scripts/`: `build.mjs` (esbuild; generates `tokens.css` and the default theme CSS for first paint), `serve.mjs`, `render-check.mjs`.

## Rules the code follows
- No `innerHTML` with data; all text goes through `textContent`.
- No inline scripts or styles in markup (works under a strict CSP; the dev server sends one).
- No network requests: no web fonts, no favicons for shortcuts (monograms instead).
- Motion respects `prefers-reduced-motion`; nothing animates on load.

## Third-party code
`@material/material-color-utilities` (Apache-2.0, Google), bundled into the page scripts with its licence header kept. It is the same colour algorithm Chromium uses, with the 2025 (Material 3 Expressive) spec.
