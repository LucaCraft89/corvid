---
name: debrand-and-degoogle
description: Rename Chromium to Corvid and remove or neutralize all Google services and telemetry. Use in Phase 1 and whenever a rebase may have reintroduced a Google endpoint.
---

# debrand-and-degoogle

## Debrand
- All names, bundle ids, desktop files, icons, user-agent product token, and installer strings come from `branding/config.toml` via the render step in `apply-patches`. No literal "Corvid" in patches except through the template.
- Replace Chromium/Google icons and strings; keep upstream license and credits pages intact and add Corvid's.

## De-Google (work list; track each in `docs/degoogle.md` with status)
- Sync service endpoints, Google sign-in, account consistency (Mirror/Dice).
- Safe Browsing and its reporting; Chrome Variations/field trials (disable seed fetch, ship fixed defaults).
- UMA/metrics, crash upload (replace with local-only `diagnostics-event` store), URL-keyed anonymized data collection, Google Update.
- Translate, spellcheck downloads, component updater endpoints (re-point to a configurable source or disable per component), Google DNS-over-HTTPS defaults, network time queries, geolocation service (Google Location Services), Cast/Google-hosted component fetches, RLZ, Google Doodles/NTP search promos.
- Search engine defaults: ship a configurable list; no Google-owned default promotion.
- Pre-resolve/preconnect to Google hosts.

## Verification (required, not optional)
1. Run a clean profile with an idle browser for 15 minutes behind a logging proxy or with `strace -e network` and a packet capture.
2. Expected: zero outbound connections except user-initiated navigation and extension update checks to the configured source.
3. Grep the built binary and resources for Google service hostnames; allow-list only intentional ones (e.g. user-visible search provider entries).
4. Fail CI if the idle capture contains an unlisted host. Keep the allow-list in `docs/network-allowlist.md`.

## Pitfalls
- Disabling a feature via flag is fine; prefer compile-time removal only when small. Every deep removal increases rebase cost.
- Re-run this check after every Chromium rebase.
