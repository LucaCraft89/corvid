# Corvid design system (structure draft, 2026-10-13)

Status: DRAFT. Structure and rules only. Concrete token values come from `theme/tokens/` and the M3E engine (`skills/theme-m3e`); this file must not copy another browser's values. Written early (before M4) because the cloud sessions can do it without a build. Luca reviews before it binds.

## 1. Principles
1. Material You 3 Expressive: rounded shapes, tonal color from one palette engine, expressive motion that stays short.
2. Edge-level polish, Helium-level restraint, but airier: generous spacing, few controls visible at once, nothing cramped.
3. Everything is movable and hideable (layout engine); required components (address bar, tab access, reset layout) cannot be removed.
4. No sharp-corner or old-style chrome. Not modeled on Arc, Vivaldi, Brave or Firefox looks, and not Chrome's rigidity.
5. Strings only via the i18n catalog; colors only via `--cv-*` tokens (lint: no raw hex in `ui/`).

## 2. Color
Roles from the engine: primary, secondary, tertiary, error; surface and surface-container steps; on-* roles; outline. Light, dark, auto; contrast levels standard, medium, high. Sources: seed color, wallpaper, platform provider (GTK/libadwaita/KDE now; Windows and Android later). WCAG AA for text roles is a test, not a goal.

## 3. Shape
Scale from extra-small to full (pill). Chrome surfaces use large radii; controls use medium to full. Shape may change on state (Expressive morph) but never to square.

## 4. Typography
One UI family with a monospace companion for diagnostics. Type roles: display, headline, title, body, label, each with size, weight and line height tokens. Dense data (diagnostics hub) uses body-small and label roles, never below the minimum size token.

## 5. Spacing and density
4 px base grid. Three densities (comfortable default, compact, spacious) that scale spacing and control height together; compact must still meet touch/pointer minimum target sizes in settings.

## 6. Elevation and state
Tonal surface elevation first, shadow sparingly. State layers (hover, focus, pressed, dragged) as opacity overlays from tokens. Focus ring always visible for keyboard use.

## 7. Motion
Spring-like easing tokens, duration tokens (short, medium, long). Respect reduced-motion. Layout edit mode may animate placement; page content never animates on load.

## 8. Components (in `ui/components/`)
Buttons (filled, tonal, outlined, text, icon), chips, switches, sliders, text fields, menus, dialogs, tabs, tab strip item, toolbar button, side-panel host, toast, list item, card, empty and error states. Each consumes tokens only and ships with a story/test in the overlay tests.

## 9. Surfaces
Tab strip (vertical default `desktop-vertical-tabs`, horizontal option), toolbar/address bar (top or bottom, `addressbar.position`), side panels, new tab, settings, extensions, history, downloads, diagnostics hub, error pages (plain-language summary on top, technical detail below), edit mode (drag handles, slot outlines, always-reachable Reset layout).

## 10. Content rules
Plain language, sentence case, no jargon in headlines; error pages and diagnostics may show technical detail below the summary.

## 11. Defaults chosen (2026-10-14, coordinator relay of Luca's go-ahead; Luca can change any of them)
- Style: Material You 3 Expressive, rounded shapes, airy spacing. Default density: comfortable.
- Default seed color: a muted blue-violet (`#5B6BC0`) until Luca picks one; follow-system accent (GTK/KDE) on by default where the provider exists, with the seed as fallback and manual override.
- Typeface: the system UI font (no bundled font in 0.1).
- Tabs: horizontal by default (Chromium's native strip); vertical tabs optional, only through Chromium's own vertical tab strip if the pinned tree has it. A custom WebUI tab strip is M5, not 0.1.
- Customization in 0.1: theme color/scheme, density, Corvid pages and side panels, extensions. Free drag-and-drop layout of the chrome itself is M5 (0.2+).
