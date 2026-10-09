# DevTools integration note

UNVERIFIED: devtools-frontend was not inspected (not present). Two candidate routes, decide after one inspection of the pinned tree:

1. Bundled DevTools extension panel (`chrome.devtools.panels.create`): zero edits to devtools-frontend; needs a host binding to reach the diagnostics service (extension page gets it via a privileged Corvid API injected only for the bundled extension id).
2. Overlay frontend module registered via the frontend's view-extension registry: closer integration (console sidebar, Performance panel link) but touches frontend build config (one small patch).

Panel logic is already written and unit-tested independent of route: `ui/devtools/{verbose-console,perf-overlay,panel}.ts`. Perf overlay on the page itself must run in an isolated world / browser-injected overlay, not page script, to avoid page tampering.
