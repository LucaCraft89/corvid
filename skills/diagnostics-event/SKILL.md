---
name: diagnostics-event
description: Add or change events, collectors, and views in the Corvid diagnostics hub (hangs, freezes, crashes, network/TLS/DNS, console errors, memory). Use for any verbose reporting feature.
---

# diagnostics-event

## Model
- Event bus in `src-overlay/corvid/diagnostics/`: typed events `{ts, tabId?, frameId?, source, severity, kind, data}`; local ring buffer on disk (size-capped, configurable), never uploaded.
- Collectors (one file each): renderer hang/unresponsive (use existing hang monitor hooks), freeze detection with stack capture (sample renderer main thread via crashpad/minidump-style capture or the existing hang report path; record in local store), crash reports (local minidumps + symbolized summary), net errors (net log: DNS, connect, TLS handshake/cert chain, redirects, retry), console errors/warnings per page, memory/CPU per process, extension errors, service-worker failures.
- Consumers: `corvid://diagnostics` hub, error pages (`add-webui-page`), DevTools extension (`devtools-extension`), exporter (JSON + zip with minidumps, user-triggered only).

## Steps to add an event kind
1. Define it in `diagnostics.mojom` and the TypeScript types in `ui/diagnostics/types.ts`.
2. Implement the collector; keep overhead under 1% CPU idle (measure with the perf overlay).
3. Add a view/filter in the hub; add a plain-language explanation string (i18n) and a "what to try" hint where there is one.
4. Add a test that triggers the event (e.g. `corvid://hang-test`, dev-only) and asserts it appears within the time budget.

## Privacy
- Data stays local. Export is explicit and shows exactly what is included. URLs/paths can be redacted with one toggle.
- Verify the idle network capture stays empty (`debrand-and-degoogle`).

## Done when
- Event is produced, stored, shown in the hub, appears in exports, and has tests plus overhead measurement.
