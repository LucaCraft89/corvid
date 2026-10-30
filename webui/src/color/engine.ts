// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Colour engine: one seed colour in, a full Material 3 palette out.
// Built on Google's material-color-utilities (Apache-2.0) with the 2025
// (Material 3 Expressive) colour spec, the same algorithm Chromium uses for
// its own dynamic colour, so the browser frame and Corvid pages agree.
// On top of that every text pair is checked against WCAG AA and nudged if
// it falls short.

import {
  argbFromHex,
  DynamicScheme,
  Hct,
  hexFromArgb,
  SchemeExpressive,
  SchemeNeutral,
  SchemeTonalSpot,
  SchemeVibrant,
} from '@material/material-color-utilities';
import { AA_NON_TEXT, AA_TEXT, contrastRatio, isHexColor } from './contrast.js';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ContrastLevel = 'standard' | 'medium' | 'high';
export type PaletteStyle = 'tonal' | 'expressive' | 'vibrant' | 'neutral';

export const THEME_MODES: readonly ThemeMode[] = ['auto', 'light', 'dark'];
export const CONTRAST_LEVELS: readonly ContrastLevel[] = ['standard', 'medium', 'high'];
export const PALETTE_STYLES: readonly PaletteStyle[] = ['tonal', 'expressive', 'vibrant', 'neutral'];

/** Placeholder default from docs/PROJECT.md (open question 7). */
export const DEFAULT_SEED = '#5B6BC0';

const CONTRAST_VALUE: Record<ContrastLevel, number> = { standard: 0, medium: 0.5, high: 1 };

export const COLOR_ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
  'background', 'onBackground',
  'surface', 'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest',
  'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary',
  'outline', 'outlineVariant', 'shadow', 'scrim', 'surfaceTint',
] as const;

export type ColorRole = (typeof COLOR_ROLES)[number];
export type Palette = Record<ColorRole, string>;

export interface PaletteOptions {
  seed: string;
  dark: boolean;
  contrast?: ContrastLevel;
  style?: PaletteStyle;
}

const SURFACES: ColorRole[] = [
  'surface', 'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow',
  'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
];

export interface ContrastPair {
  fg: ColorRole;
  bg: ColorRole;
  min: number;
}

/** Foreground/background pairs the pages actually draw, with their WCAG AA minimum. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...(['primary', 'secondary', 'tertiary', 'error'] as const).flatMap((r) => {
    const cap = r[0]!.toUpperCase() + r.slice(1);
    return [
      { fg: `on${cap}` as ColorRole, bg: r, min: AA_TEXT },
      { fg: `on${cap}Container` as ColorRole, bg: `${r}Container` as ColorRole, min: AA_TEXT },
    ];
  }),
  { fg: 'onPrimaryFixed', bg: 'primaryFixed', min: AA_TEXT },
  { fg: 'onPrimaryFixedVariant', bg: 'primaryFixed', min: AA_TEXT },
  { fg: 'onBackground', bg: 'background', min: AA_TEXT },
  ...SURFACES.flatMap((bg) => [
    { fg: 'onSurface' as ColorRole, bg, min: AA_TEXT },
    { fg: 'onSurfaceVariant' as ColorRole, bg, min: AA_TEXT },
    { fg: 'primary' as ColorRole, bg, min: AA_TEXT }, // links and text buttons
    { fg: 'error' as ColorRole, bg, min: AA_TEXT }, // inline error text
    { fg: 'outline' as ColorRole, bg, min: AA_NON_TEXT }, // field borders
  ]),
  { fg: 'onSurfaceVariant', bg: 'surfaceVariant', min: AA_TEXT },
  { fg: 'inverseOnSurface', bg: 'inverseSurface', min: AA_TEXT },
  { fg: 'inversePrimary', bg: 'inverseSurface', min: AA_TEXT },
];

function makeScheme(seed: Hct, dark: boolean, contrast: number, style: PaletteStyle): DynamicScheme {
  switch (style) {
    case 'expressive': return new SchemeExpressive(seed, dark, contrast, '2025');
    case 'vibrant': return new SchemeVibrant(seed, dark, contrast, '2025');
    case 'neutral': return new SchemeNeutral(seed, dark, contrast, '2025');
    case 'tonal': return new SchemeTonalSpot(seed, dark, contrast, '2025');
  }
}

/** Moves fg's tone away from bg until the pair reaches min. Keeps hue and chroma. */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  const f = Hct.fromInt(argbFromHex(fg));
  const b = Hct.fromInt(argbFromHex(bg));
  const dir = b.tone >= 50 ? -1 : 1;
  for (let tone = f.tone; tone >= 0 && tone <= 100; tone += dir) {
    const c = hexFromArgb(Hct.from(f.hue, f.chroma, tone).toInt());
    if (contrastRatio(c, bg) >= min) return c;
  }
  return dir < 0 ? '#000000' : '#ffffff';
}

/** Builds the palette for one seed, mode, contrast level and style. */
export function makePalette(opts: PaletteOptions): Palette {
  if (!isHexColor(opts.seed)) throw new Error(`seed is not a colour: ${opts.seed}`);
  const seed = Hct.fromInt(argbFromHex(opts.seed));
  const scheme = makeScheme(seed, opts.dark, CONTRAST_VALUE[opts.contrast ?? 'standard'], opts.style ?? 'tonal');
  const out = {} as Palette;
  for (const role of COLOR_ROLES) out[role] = hexFromArgb(scheme[role]);
  // Fix pairs in order; a role that appears as fg against several surfaces
  // is checked against each, so the last adjustment satisfies all of them
  // (tones only ever move further away from the surfaces).
  for (let pass = 0; pass < 2; pass++) {
    for (const p of CONTRAST_PAIRS) out[p.fg] = ensureContrast(out[p.fg], out[p.bg], p.min);
  }
  return out;
}

export interface ContrastIssue extends ContrastPair {
  ratio: number;
}

/** Lists every pair in the palette that misses WCAG AA. Empty means it passes. */
export function checkPalette(p: Palette): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const pair of CONTRAST_PAIRS) {
    const ratio = contrastRatio(p[pair.fg], p[pair.bg]);
    if (ratio < pair.min) issues.push({ ...pair, ratio });
  }
  return issues;
}

/** Tonal ramp of the seed's primary palette, for previews. */
export function primaryTones(seed: string, tones = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100]): string[] {
  const scheme = makeScheme(Hct.fromInt(argbFromHex(seed)), false, 0, 'tonal');
  return tones.map((t) => hexFromArgb(scheme.primaryPalette.tone(t)));
}

function kebab(role: string): string {
  return role.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/** CSS custom properties for a palette: --md-sys-color-on-primary: #...; */
export function paletteToCss(p: Palette): string {
  return COLOR_ROLES.map((r) => `--md-sys-color-${kebab(r)}: ${p[r]};`).join('\n');
}

export function cssVarName(role: ColorRole): string {
  return `--md-sys-color-${kebab(role)}`;
}
