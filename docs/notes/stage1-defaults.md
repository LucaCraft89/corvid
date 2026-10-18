# Stage-1 build decisions (VM builder, 2026-10-18, autonomous run)

Luca handed over full autonomy on 2026-10-18. Where the plan left a question open, this is the default I chose and why.

| Question | Default | Why |
|---|---|---|
| Internal pages without a backend (settings, extensions, history, downloads, bookmarks, password manager, certificate manager, version, management) | Stock Chromium pages (`IsStockFallbackHost`) | The Corvid pages are shells with no data layer; blocking the stock ones left no way to manage extensions, history, downloads or settings. Revisit when the Corvid page API exists. |
| Native shell WebUIs (`*.top-chrome`, unlisted `chrome-untrusted://`, `chrome://print`, `newtab-footer`) | Never rewritten or blocked | Blocking them crashed the browser (tab search, the new tab footer under an extension new tab) or broke print preview. |
| uBlock Origin list updates | Off (`autoUpdate=false` via managed storage, `/etc/<brand>/policies/managed/corvid-preinstalled.json`) | uBO fetched its lists and the public suffix list about 40 s after start, which failed the idle-network gate. Lists stay as bundled until the user opts in. |
| Policy directory | `/etc/<brand>/policies` (patch 0185) | Do not share `/etc/chromium/policies` with Chromium installs. |
| "Managed by your organization" | Only for browser-level policies (patch 0186) | Extension (3rdparty) policies are our own configuration, not an organization. |
| WebRTC IP handling | Chromium default (patch 0170 removed) | `default_public_interface_only` gathers no ICE candidates behind a NAT without STUN, so loopback and LAN data channels fail (acceptance 12). The default hides private IPs behind mDNS names already (check 2 of 12 passes). |
| Typed `corvid://` | A URL for the omnibox (patch 0290) | It was sent to the search engine as a query. |
| Extension new tab overrides | Resolved before the brand handler (patch 0250) | The brand handler rewrote `chrome://newtab` first, so overrides never applied. |
| Default search engine | Unchanged: DuckDuckGo first for real locales; no-region profiles get the first remaining engine | Documented in patch 0196. |
