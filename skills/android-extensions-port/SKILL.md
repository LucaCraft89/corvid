---
name: android-extensions-port
description: Bring the full Chromium extension system (MV2 and MV3, background pages/service workers, content scripts, popups, devtools pages) to Corvid on Android with a touch UI. The hardest task in the project; run as an isolated track.
---

# android-extensions-port

## Step 0: research (do this first, write findings to `docs/notes/android-ext-baseline.md`)
- Check how far upstream Chromium for Android has come with extensions in the pinned version: what builds under the Android configuration (extensions core targets and build flags such as `enable_extensions_core`/`enable_extensions`), what is gated off, and whether Chromium's desktop-class Android work already covers parts of this. Reuse upstream wherever it exists; only port what is missing.
- Also review other Chromium-based Android browsers that ship extensions to understand the common pitfalls. Do not copy code without a license check.

## Port plan (adapt to what step 0 finds)
1. Build the extension browser/common/renderer layers into the Android target; fix compile errors by adding Android implementations of desktop-only delegates (`ExtensionsBrowserClient`, `ExtensionHostDelegate`, extension system provider, etc.).
2. Process model: background service workers and (MV2) persistent/event background pages need a process lifecycle that survives Android memory pressure; implement keep-alive policy tied to the app foreground/background state, and a Doze-friendly event wakeup path.
3. Browser UI: touch-friendly extension manager (`corvid://extensions` shared with desktop), toolbar/menu entry for extension actions and popups (popups as bottom sheets or floating panels), permissions prompts, per-site access control, install-from-source flow.
4. APIs: bring up in this order: `storage`, `runtime`, `tabs`, `scripting`/content scripts, `webRequest` (MV2 blocking) and `declarativeNetRequest`, `alarms`, `contextMenus` (map to long-press menu), `action`/`browserAction`, `commands` (no keyboard: expose via UI), `devtools` (n/a on mobile; stub gracefully), then the long tail. Track every API's status in `docs/ext-api-android.md`.
5. Install: from configured sources, local CRX/ZIP, and preinstalled uBO (`preinstall-extension`).
6. Performance and battery: measure idle wakeups and memory with uBO and 10 typical extensions; set budgets in the spec.
7. Security: reuse Chromium's extension sandbox/permission model unchanged; no weakening for convenience.

## Milestones
M1 content-script extensions work; M2 uBO full works incl. blocking webRequest; M3 popups/options pages usable by touch; M4 top-100 compatibility list tracked and >= target pass rate set in the Phase 5 spec; M5 battery/memory budgets met.

## Done when
- Milestones above verified on a physical device; compatibility table committed.
