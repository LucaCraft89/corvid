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
- Chromium refuses to commit any navigation whose URL contains the substring `.top-chrome` (ERR_FAILED, stock "This site can't
  be reached"), including a query value. The blocked page therefore gets the original URL with dots percent-escaped
  (`stock_page_policy.cc`); without that, the 6 top-chrome entries of the stock table showed the stock error page.
- Omnibox classification of a typed `corvid://x` is not patched (not testable headless); the Corvid omnibox lands with M5.
- Stock shell WebUIs not in the table (print preview, ...) would be blocked; only `*.top-chrome` and `chrome://headless`
  (command handler for --dump-dom/--screenshot, `IsInternalToolHost`) are exempted.
- Rename: the scheme and host prefix come from `branding/templates/corvid/webui/brand.h.in` (url_scheme); hook patches only
  mention the overlay namespace (`corvid::`, `//corvid/`), which tests/acceptance/phase-0/rename.sh treats as the codename.
  The TS pages still contain literal `corvid://` links (UI branding is G5).
