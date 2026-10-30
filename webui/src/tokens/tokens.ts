// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Material 3 Expressive design tokens (shape, type, spacing, density, motion)
// as data, plus a CSS generator. Colour tokens come from the colour engine.

export const shape = {
  none: 0,
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  largeIncreased: 20,
  extraLarge: 28,
  extraLargeIncreased: 32,
  extraExtraLarge: 48,
  full: 9999,
} as const;

/** 4 dp grid. */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Type scale (size / line height in px, weight). Emphasized = heavier weight. */
export const typeScale = {
  displayLarge: [57, 64, 400],
  displayMedium: [45, 52, 400],
  displaySmall: [36, 44, 400],
  headlineLarge: [32, 40, 400],
  headlineMedium: [28, 36, 400],
  headlineSmall: [24, 32, 400],
  titleLarge: [22, 28, 400],
  titleMedium: [16, 24, 500],
  titleSmall: [14, 20, 500],
  bodyLarge: [16, 24, 400],
  bodyMedium: [14, 20, 400],
  bodySmall: [12, 16, 400],
  labelLarge: [14, 20, 500],
  labelMedium: [12, 16, 500],
  labelSmall: [11, 16, 500],
} as const satisfies Record<string, readonly [number, number, number]>;

/** System font until the owner picks a typeface (docs/PROJECT.md, open question 7). */
export const fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif';
export const monoFamily = 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", "Noto Sans Mono", monospace';

export type Density = 'comfortable' | 'compact' | 'spacious';
export const DENSITIES: readonly Density[] = ['comfortable', 'compact', 'spacious'];

/** Density scale: how many 4 px steps controls grow or shrink, as in M3 (0, -2) plus a touch step. */
export const densityStep: Record<Density, number> = { spacious: 2, comfortable: 0, compact: -2 };

/** M3 Expressive motion springs (damping ratio, stiffness). */
export const springs = {
  spatialFast: [0.6, 800],
  spatialDefault: [0.8, 380],
  spatialSlow: [0.8, 200],
  effectsFast: [1, 3800],
  effectsDefault: [1, 1600],
  effectsSlow: [1, 800],
} as const satisfies Record<string, readonly [number, number]>;

export interface SpringEasing {
  /** CSS linear() easing function. */
  easing: string;
  /** Duration in ms until the spring settles within 0.1% of the end. */
  duration: number;
}

/**
 * Turns a spring into a CSS linear() easing and a duration. Mass is 1 and the
 * spring starts at rest, as in Material's motion spec. CSS has no springs, so
 * the curve is sampled; overshoot shows as values above 1.
 */
export function springToCss(damping: number, stiffness: number, samples = 40): SpringEasing {
  const w0 = Math.sqrt(stiffness);
  const pos = (t: number): number => {
    if (damping < 1) {
      const wd = w0 * Math.sqrt(1 - damping * damping);
      return 1 - Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + ((damping * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t); // critically damped
  };
  // Settle time: last moment the curve is more than 0.1% away from 1.
  let settle = 0;
  for (let t = 0; t < 5; t += 0.001) if (Math.abs(1 - pos(t)) > 0.001) settle = t;
  settle += 0.001;
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const v = i === samples ? 1 : pos((settle * i) / samples);
    pts.push(String(Math.round(v * 1000) / 1000));
  }
  return { easing: `linear(${pts.join(', ')})`, duration: Math.round(settle * 1000) };
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/** All non-colour tokens as CSS custom properties on :root. */
export function tokensCss(): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(shape)) lines.push(`--md-sys-shape-corner-${kebab(k)}: ${v}px;`);
  for (const [k, v] of Object.entries(space)) lines.push(`--corvid-space-${k}: ${v}px;`);
  lines.push(`--md-ref-typeface-plain: ${fontFamily};`, `--md-ref-typeface-mono: ${monoFamily};`);
  for (const [k, [size, line, weight]] of Object.entries(typeScale)) {
    const n = kebab(k);
    lines.push(
      `--md-sys-typescale-${n}-size: ${size}px;`,
      `--md-sys-typescale-${n}-line-height: ${line}px;`,
      `--md-sys-typescale-${n}-weight: ${weight};`,
    );
  }
  for (const [k, [d, s]] of Object.entries(springs)) {
    const { easing, duration } = springToCss(d, s);
    lines.push(`--md-sys-motion-spring-${kebab(k)}: ${easing};`, `--md-sys-motion-spring-${kebab(k)}-duration: ${duration}ms;`);
  }
  const density = DENSITIES.map(
    (d) => `:root[data-density="${d}"] { --corvid-density: ${densityStep[d]}; }`,
  ).join('\n');
  return `:root {\n${lines.join('\n')}\n--corvid-density: 0;\n}\n${density}\n`;
}
