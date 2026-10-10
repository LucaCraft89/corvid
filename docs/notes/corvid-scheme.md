# corvid:// scheme design (G1, Chromium 155.0.8059.39)

Decision: `corvid://` is an alias scheme over `chrome://`, not a second WebUI scheme.

Why: `kChromeUIScheme` is referenced by ~405 non-test files in Chromium 155 (security policy, process model, WebUI
bindings, data sources). A real second WebUI scheme would be a huge, high-rebase-risk patch. The alias approach touches
5 upstream files by 1-3 lines each.

How it works
- `corvid` is added to `kChromeStandardURLSchemes` (chrome/common/chrome_content_client.cc) so GURL parses a host.
- `corvid::HandleCorvidUrl` is registered first in `ChromeContentBrowserClient::BrowserURLHandlerCreated`
  (BrowserURLHandler runs on every browser-initiated navigation): stock `chrome://x` -> policy decision (replaced / redirected
  / blocked, `stock_page_policy`) -> `corvid://page` -> internal `chrome://corvid-<page>`. Unknown hosts -> `corvid-blocked?url=`.
- The reverse handler maps `chrome://corvid-<page>` back to `corvid://<page>`, so the omnibox / `Target.url` / history show
  `corvid://`. In the renderer `location.href` is `chrome://corvid-<page>` (as in other brand-scheme forks).
- Pages: `ui/pages/*` bundled by `ui/tools/bundle.mjs` (esbuild, MIT, devDependency), embedded as C++ byte arrays by
  `src-overlay/corvid/webui/embed_resources.py` (no grit/pak/resource_ids.spec edit), served by one
  `WebUIDataSource` per page; extension-less sub-paths fall back to index.html (SPA routes). Trusted Types stay on
  (`trusted-types lit-html`).
- Data: pages run on `ui/pages/shared/stub-api.ts` (empty data) until the Mojo `PageHandler` exists (M4).
- Deny by default (0220): all chrome:// `WebUIConfig`s that are not `corvid-*` are removed, EXCEPT `*.top-chrome`: removing
  them crashes startup (`WebUIContentsWrapperT` dereferences the config for the omnibox popup, stack in M3-G1 report).
  Unlisted `*.top-chrome` hosts also pass the URL handler untouched so the stock shell (omnibox popup) keeps working until M5.

Known limits
- Top-chrome hosts listed in stock-pages.json (tab-strip, tab-search, side-panel, read-later, bookmarks/customize side
  panels): the URL is rewritten to corvid://blocked but Chromium refuses to commit navigations whose original URL is a
  top-chrome WebUI inside a tab (ERR_FAILED, stock "This site can't be reached"). No stock WebUI content is shown, but it is
  not a Corvid page: acceptance 02 reports 6 FAIL. Revisit with the Corvid error page (G4) or M5.
- Omnibox classification of a typed `corvid://x` is not patched (not testable headless); the Corvid omnibox lands with M5.
- Stock shell WebUIs (print preview, ...) not in the table would be blocked; only top-chrome is exempted.
