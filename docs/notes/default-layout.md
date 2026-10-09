# Default layout choice

Decision (2026-10-09, user asked for "something modern"; chosen by the agent): **`desktop-vertical-tabs`** is the default preset.

Rationale: a vertical tab rail on the left scales to many tabs (titles stay readable), uses the abundant horizontal space on wide screens, and gives the toolbar a single compact row on top, which matches the rounded, container-based Material 3 Expressive look (large corner radii, tonal surface containers). Top tabs ("classic") are one setting or drag away.

All other presets stay selectable: `desktop-classic` (top tabs), `compact` (single row, nothing extra), `mobile` (touch, bottom controls). Change the default in one place: `DEFAULT_PRESET` in `ui/layout/defaults.ts` and the manifest defaults of `layout.activePreset` / `tabstrip.position`.

Narrow windows switch to `mobile` via the layout's `breakpoints` (600 px).

Open: collapsing the rail to icons-only (a size state) is not implemented yet.
