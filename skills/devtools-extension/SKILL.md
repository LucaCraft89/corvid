---
name: devtools-extension
description: Extend Chromium DevTools in Corvid with verbose console mode, performance overlay, and links into the diagnostics hub.
---

# devtools-extension

## Approach
- DevTools frontend is a separate TypeScript app (`third_party/devtools-frontend`). Keep it as unmodified as possible; add Corvid features as an extra panel/module registered through DevTools' own module system, shipped via overlay, not by editing its core.
- Features:
  1. **Verbose console**: show all log levels by default, include network and security messages, timestamps, source/stack for every message, and a "copy as report" action.
  2. **Perf overlay**: on-page and DevTools-docked view of FPS/long tasks, main-thread blocking time, memory, and layout/paint counts; toggle with a shortcut.
  3. **Diagnostics link**: a panel that mirrors `corvid://diagnostics` data for the inspected tab (hangs, errors, net timeline).
  4. **Freeze capture**: button to capture a main-thread stack and trace for the current tab.

## Steps
1. Locate how DevTools modules are registered in the pinned version (do not assume; inspect the module registration code once and note it in `docs/notes/devtools.md`).
2. Build the panel in `ui/devtools/`; consume data from the diagnostics Mojo/JSON API through the DevTools host bindings.
3. Respect user privacy: no network calls.
4. Tests: open DevTools on a test page that logs, throws, and blocks the main thread; assert each feature shows the expected result.

## Pitfalls
- DevTools updates frequently; keep patches to the frontend minimal and re-test on each rebase.
