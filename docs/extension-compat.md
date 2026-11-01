# Extension compatibility

Written by `build/test-extensions.sh` (do not edit by hand; rerun it).

- Browser: Corvid 0.20.2.1 (Chromium 156.0.8078.73), Linux (dev build), run 2026-11-01 14:21 UTC.
- Result: **20/20 installed extensions pass** (target 85% on desktop); must-pass categories: adblock 5/5, password 4/4, newtab 2/2.
- Each extension gets a fresh profile and is installed the way a user would: its store link or ID in `corvid://preferences` (or the Chrome Web Store page), then the real install prompt is clicked.
- Checks: installed and enabled; background (service worker or page) running; popup or options page loads with no script error; a category check where one exists (ad blockers: an ad script on a known ad host is blocked, with the preinstalled uBlock Origin turned off; new tab: `chrome://newtab` shows the extension; dark mode: a white page turns dark; ClearURLs: tracking parameters are removed).
- Not checked: features that need an account or a third-party site (password autofill, YouTube features, Grammarly suggestions).

| Extension | Store | MV | Version | Installed | Background | Popup/options | Category check | Result | Notes |
|---|---|---|---|---|---|---|---|---|---|
| uBlock Origin (preinstalled) | bundled | 2 | 1.75.0 | pass | pass | pass (popup-fenix.html: 183 elements) | pass (ad script blocked, ad box hidden) | **PASS** |  |
| uBlock Origin Lite | chrome | 3 | 2026.1026.1812 | pass | pass | pass (popup.html: 53 elements) | pass (ad script blocked, ad box shown) | **PASS** | preinstalled uBlock Origin off: ok |
| AdGuard AdBlocker | chrome | 3 | 5.5.3.28 | pass | pass | pass (pages/popup.html: 118 elements) | pass (ad script blocked, ad box shown) | **PASS** | preinstalled uBlock Origin off: ok |
| Adblock Plus | chrome | 3 | 4.49.0 | pass | pass | pass (popup.html: 105 elements) | pass (ad script blocked, ad box shown) | **PASS** | preinstalled uBlock Origin off: ok |
| Ghostery | chrome | 3 | 10.6.10 | pass | pass | pass (pages/panel/index.html: 13 elements) | pass (ad script blocked, ad box hidden) | **PASS** | preinstalled uBlock Origin off: ok |
| Privacy Badger | chrome | 3 | 2026.9.15.2 | pass | pass | pass (skin/popup.html: 113 elements) | n/a | **PASS** |  |
| ClearURLs | edge | 2 | 1.27.3 | pass | pass | pass (html/popup.html: 89 elements) | pass (address after load http://site.test/page?id=1) | **PASS** |  |
| Bitwarden | chrome | 3 | 2026.10.1 | pass | pass | pass (popup/index.html: 121 elements) | n/a | **PASS** |  |
| 1Password | chrome | 3 | 8.12.42.36 | pass | pass | pass (popup/index.html: 26 elements) | n/a | **PASS** |  |
| KeePassXC-Browser | chrome | 3 | 1.10.4.1 | pass | pass | pass (popups/popup.html: 85 elements) | n/a | **PASS** |  |
| Proton Pass | chrome | 3 | 1.43.0 | pass | pass | pass (popup.html: 140 elements) | n/a | **PASS** |  |
| Momentum | chrome | 3 | 2.27.9 | pass | pass | n/a | pass (new tab shows chrome-extension://laookkfknpbbblfpciffpaejjkokdgca/index.html) | **PASS** |  |
| Tabliss | chrome | 3 | 2.6.0 | pass | n/a | n/a | pass (new tab shows chrome-extension://hipekcciheckooncpjeljhnekcoolahp/index.html) | **PASS** |  |
| Dark Reader | chrome | 3 | 4.9.134 | pass | pass | pass (ui/popup/index.html: 392 elements) | pass (page background rgb(24,26,27)) | **PASS** |  |
| SponsorBlock | chrome | 3 | 6.1.6 | pass | pass | pass (popup.html: 85 elements) | n/a | **PASS** |  |
| Return YouTube Dislike | chrome | 3 | 4.0.5 | pass | pass | pass (popup.html: 115 elements) | n/a | **PASS** |  |
| Grammarly | chrome | 3 | 14.1343.0 | pass | pass | pass (src/popup.html: 52 elements) | n/a | **PASS** |  |
| Tampermonkey | chrome | 3 | 5.5.1 | pass | pass | pass (action.html: 105 elements) | n/a | **PASS** |  |
| Violentmonkey | chrome | 3 | 2.50.0 | pass | pass | pass (popup/index.html: 64 elements) | n/a | **PASS** |  |
| React Developer Tools | chrome | 3 | 8.0.0 | pass | pass | pass (popups/disabled.html: 4 elements) | n/a | **PASS** |  |
| JSON Formatter | chrome | 3 | 0.10.2 | pass | n/a | pass (options/options.html: 12 elements) | n/a | **PASS** |  |
