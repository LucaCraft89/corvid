# Address bar position (top or bottom)

Requirement (2026-10-09): the user can place the address bar at the top or bottom of the window on desktop and Android; it can never be removed.

Implemented (TypeScript, tested in `ui/layout/layout.test.ts`):
- Manifest `corvid.addressbar`: slot `window.top`, `allowedSlots` = top and bottom, `role: addressbar`, `hideable: false`; setting `addressbar.position` (`top` | `bottom`).
- Ops: `setAddressBarPosition` / `addressBarPosition` in `ui/layout/ops.ts`; edit-mode drag and drop already targets the bottom bar (`dropTarget` + `moveSlot`). Guard rails refuse hiding/removing it and refuse left/right/floating.
- All four presets validate with the bar in either position; position persists across restart; "Reset layout" restores the preset's position.

Phase 5 (Android) must wire:
- The `mobile` preset is `PRESETS['mobile']` in `ui/layout/defaults.ts` (there is no `ui/layout/presets/mobile.json`; if Phase 5 splits presets into JSON files, keep the same slot ids: `addressbar` in `top` by default).
- Use `setAddressBarPosition` from the Android settings entry for `addressbar.position`, and from the edit-mode long-press drag.
- Bottom placement on Android: pad for the gesture/navigation bar and the IME (`env(safe-area-inset-bottom)` / visualViewport) and keep the touch target >= 48 dp; when the bar is at the bottom, the toolbar buttons should not also be at the bottom row in the same slot group (mobile preset puts them in the same bottom bar today: reorder with `moveSlot` so the address bar is nearest the content edge).
- The Android shell must expose the same `window.__corvidTest.addressBarTo` hook under test builds.
