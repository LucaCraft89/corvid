# De-Google and debrand work list (task 1.1)

Skill: `debrand-and-degoogle`. Status values: `not started`, `specified` (approach written, patch/args drafted, **UNVERIFIED**: not applied or built), `verified` (applied, built, and checked by the idle capture). No item is `verified` yet: this work was done without a Chromium checkout.

Strategy order per item: (1) GN arg in `build/args/linux-*.gn`, (2) runtime default via prefs/feature list, (3) minimal patch under `patches/debrand/` (listed, disabled until refreshed, in `patches/series.phase1`), (4) compile-time removal only when small.

| # | Item | Mechanism | Where | Status |
|---|---|---|---|---|
| 1 | Sync service endpoints, Google sign-in, account consistency (Mirror/Dice) | patch: sign-in/sync disabled by policy defaults; hide UI (Corvid UI never links them); sync returns in Phase 4 against self-hosted server | `patches/debrand/0130-*` | verified (idle 15 min: 0 connections) |
| 2 | Safe Browsing lookups and reporting | GN `safe_browsing_mode=0` + pref defaults off | `build/args`, `patches/debrand/0120-*` | verified |
| 3 | Variations / field trials (seed fetch) | GN `disable_fieldtrial_testing_config=true` + patch to never create the variations service seed fetcher | `patches/debrand/0110-*` | verified |
| 4 | UMA metrics, UKM, URL-keyed anonymized data | patch: metrics reporting permanently disabled | `patches/debrand/0100-*` | verified |
| 5 | Crash upload | patch: no upload; crashes stay local (Phase 2 `diagnostics-event` store; `corvid://crash`) | `patches/debrand/0100-*` | verified (non-branded build never uploads; consent forced false) |
| 6 | Google Update | not built on Linux packages (no updater); update path is package manager/AppImage metadata (task 1.13) | `scripts/package.sh` | specified |
| 7 | Translate | patch: translate service/URL disabled | `patches/debrand/0140-*` | verified (no background traffic; user-initiated Translate hits translate.googleapis.invalid, fails closed) |
| 8 | Spellcheck dictionary downloads | patch: dictionaries bundled/optional local; download URL empty | `patches/debrand/0140-*` | verified |
| 9 | Component updater endpoints | patch: configurable source, default none (per-component allow list in settings) | `patches/debrand/0150-*` | verified |
| 10 | Google DNS-over-HTTPS defaults | patch: no default DoH provider list entries pointing to Google; DoH off unless user configures | `patches/debrand/0160-*` | verified |
| 11 | Network time queries | patch: `NetworkTimeTracker` fetches disabled | `patches/debrand/0160-*` | verified |
| 12 | Geolocation (Google Location Services) | patch: network location provider URL removed; GPS/OS location only; sites get "unavailable" | `patches/debrand/0160-*` | verified by substitution (location URL is googleapis.invalid; only on a site request) |
| 13 | Cast / Google-hosted component fetches | GN `enable_media_router=false`, `enable_service_discovery=false` | `build/args` | partially verified: Cast/service discovery cannot be switched off by GN on desktop (M1); the 15-min idle capture shows no mDNS/SSDP traffic and no Google-hosted component fetches (component updater has no source, 0150) |
| 14 | Widevine CDM download | GN `enable_widevine=false` (OPEN QUESTION for DRM video) | `build/args` | specified |
| 15 | RLZ | not built on Linux | n/a | verified (RLZ buildflag 0) |
| 16 | Doodles / NTP search promos | n/a: Corvid NTP (`corvid://newtab`) replaces the stock NTP | `ui/pages/newtab` | specified |
| 17 | Search defaults | configurable engine list, DuckDuckGo placeholder default, no Google-owned default; Google not in the shipped list | `ui/chrome/omnibox.ts` | specified: `patches/debrand/0196-*` drops Google, DuckDuckGo first + fallback (CR-8); UNBUILT, applies cleanly, needs build + idle capture |
| 18 | Pre-resolve/preconnect to Google hosts | patch: remove hard-coded hosts (e.g. NTP/omnibox warm-ups) | `patches/debrand/0160-*` | verified (kPreconnectToSearch off) |
| 19 | WebRTC: no hard-coded Google STUN | audit: grep built binary for `stun.l.google.com`; none contacted unless a site or the user supplies a server; default IP policy `default_public_interface_only`, mDNS candidates on | settings `privacy.webrtc*`, `patches/debrand/0170-*` | verified (no stun host in tree; policy default) |
| 20 | Extension store / update URLs | extension update URL is user-configurable; no Chrome Web Store default (CR-2 open) | `patches/extensions/`, `extensions/preinstalled.toml` | specified |
| 21 | Branding (names, icons, desktop file, UA token) | rendered from `branding/config.toml` by Phase 0's render step | Phase 0 | not started (depends on Phase 0) |

## Verification (required)

1. Clean profile, idle 15 minutes, NetLog + `strace -f -e trace=network` + optional pcap: `tests/acceptance/phase-1/01-no-phone-home.sh`.
2. Every host contacted must be in `docs/network-allowlist.md` (initially empty). Any other host fails the phase.
3. Binary/resource grep for Google service hostnames: `tests/acceptance/phase-1/01b-binary-host-grep.sh`; allow only intentional strings (listed in the allow-list file with a reason).
4. Re-run after every Chromium rebase.

Run on 2026-10-10 against Chromium 155.0.8059.39 (docs/reports/M3-G2-2026-10-10.md): 15-minute idle capture 0 connections; binary grep reduced from 257 to 76 host strings (HSTS/pin preload data and non-network identifiers) and still FAILS pending a user decision.

Item 17 (PC run 2026-10-12, Chromium 155.0.8059.39, reported by the PC builder; not re-run on the VM): 0196 + 0197 compile; 15-minute idle capture 0 outside connections (strace: 26 connect() calls, all local unix sockets); a clean profile lists DuckDuckGo first and no Google. Two Google-linked starter-pack entries (@aimode, @gemini) were found and removed by 0197 (rebuilt result: pending PC rerun). components_unittests filter `TemplateURL*:*Prepopulate*:*StarterPack*:*SearchEngine*:FeaturedSearchProviderTest*:AutocompleteControllerTest*:*KeywordProvider*`: baseline 2 failed / 508 ok; with 0196+0197 87 failed / 401 ok, so 85 newly fail (76 from 0196, 9 from 0197). They assert the removed behaviour; listed in `tests/chromium-expected-failures.txt` and replaced by `//corvid/search:unit_tests` (written, UNBUILT, UNRUN). Status of item 17 stays `specified` until the PC reruns with these tests and reports.
