---
name: layout-engine
description: Build or modify the Corvid layout engine that lets every UI element (tabs, toolbar, address bar, panels) be moved, resized, hidden and saved as a layout. Use for any slot, drag-and-drop, or layout persistence work.
---

# layout-engine

## Model
- A layout is a JSON tree: regions (top, bottom, left, right, floating) containing slots, each slot holding a module component with size/visibility state.
- Layouts are named, exportable, and syncable (Phase 4). Default layouts: `desktop-classic`, `desktop-vertical-tabs`, `compact`, `mobile`.
- Source: `ui/layout/`; schema in `ui/layout/layout.schema.json`.

## Steps
1. Implement the region/slot model and a renderer using CSS grid/flex and web components; no absolute-pixel layouts.
2. Edit mode: a toggle (and keyboard shortcut) that shows drag handles, snap guides, and a palette of available components from loaded modules.
3. Persist on every committed change; autosave with a debounce, store in the profile. Undo/redo stack for edit mode.
4. Guard rails: required components (address bar or equivalent, tab access, a way back to edit mode/reset) cannot be removed; "Reset layout" is always reachable via a keyboard shortcut and a settings URL.
5. Responsive: layouts declare breakpoints; the Android layout uses touch-sized targets and bottom-reachable toolbars.
6. Performance: layout changes must not reload content frames; test with 100 tabs.

## Done when
- Rearrange, hide, resize, save, restart, restore all work; reset works from a broken layout; tests cover schema validation and invalid-layout fallback.
