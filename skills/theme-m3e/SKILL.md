---
name: theme-m3e
description: Implement or change the Material You 3 Expressive theme engine (tonal palettes, tokens, shape, motion, typography) shared by all Corvid UI.
---

# theme-m3e

## Structure
- `theme/engine/`: takes a seed color (or scheme from a provider) and produces tonal palettes and the full role set (primary, secondary, tertiary, surface containers, outline, error, etc.) for light, dark, and high-contrast variants.
- `theme/tokens/`: CSS custom properties (`--cv-*`) generated from the roles, plus shape, elevation, state-layer, motion, and type tokens for the Expressive spec.
- `theme/providers/`: per-platform color sources (see `platform-color-provider`).

## Steps
1. Use Google's `material-color-utilities` (Apache-2.0) for palette generation; confirm the current version and record it in provenance. Follow the current Material 3 Expressive specification for shape (larger/more varied corner radii, shape morphing), motion (spring-based), and typography (emphasized type styles). Check the official spec before implementing; do not rely on memory of it.
2. Generate tokens at build time for defaults and at runtime for dynamic changes; apply by setting CSS variables on the root of every Corvid WebUI document, so a live change recolors without reload.
3. Components in `ui/components/` consume only tokens. Lint rule: no raw hex colors in `ui/`.
4. User controls: seed color picker, wallpaper-derived seed, follow-system toggle, contrast level, light/dark/auto.
5. Web content: optionally tint scrollbars/forms (`color-scheme`); do not alter page content unless the user enables it.
6. Tests: snapshot tokens for a set of seeds; contrast check (WCAG AA for text roles); visual regression on settings and new tab pages.

## Done when
- Changing the seed or system scheme live updates all open Corvid pages and chrome; contrast tests pass.
