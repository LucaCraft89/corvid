// Non-color design tokens for Material 3 Expressive.
//
// UNVERIFIED AGAINST SPEC: the numeric values below are reproduced from
// knowledge of the M3 / M3 Expressive token set, not checked against the
// official specification (m3.material.io) in this environment. skills/theme-m3e
// requires checking the current spec before release. Treat as placeholders
// with the right structure; fix values in this one file.

export const SHAPE_DP: Record<string, number> = {
  none: 0,
  'extra-small': 4,
  small: 8,
  medium: 12,
  large: 16,
  'large-increased': 20,
  'extra-large': 28,
  'extra-large-increased': 32,
  'extra-extra-large': 48,
  full: 9999,
};

export interface SpringToken {
  damping: number;
  stiffness: number;
}
/** Expressive motion springs. spatial = position/size; effects = color/opacity. */
export const MOTION_SPRINGS: Record<string, SpringToken> = {
  'fast-spatial': { damping: 0.9, stiffness: 1400 },
  'default-spatial': { damping: 0.9, stiffness: 700 },
  'slow-spatial': { damping: 0.9, stiffness: 300 },
  'fast-effects': { damping: 1, stiffness: 3800 },
  'default-effects': { damping: 1, stiffness: 1600 },
  'slow-effects': { damping: 1, stiffness: 800 },
};

/** Duration/easing fallbacks for contexts without JS springs (and reduced motion). */
export const MOTION_CSS = {
  'duration-short': '150ms',
  'duration-medium': '300ms',
  'duration-long': '500ms',
  'easing-standard': 'cubic-bezier(0.2, 0, 0, 1)',
  'easing-emphasized-decelerate': 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  'easing-emphasized-accelerate': 'cubic-bezier(0.3, 0, 0.8, 0.15)',
} as const;

export const ELEVATION_SHADOW: Record<string, string> = {
  'level0': 'none',
  'level1': '0 1px 2px color-mix(in srgb, var(--cv-color-shadow) 30%, transparent), 0 1px 3px 1px color-mix(in srgb, var(--cv-color-shadow) 15%, transparent)',
  'level2': '0 1px 2px color-mix(in srgb, var(--cv-color-shadow) 30%, transparent), 0 2px 6px 2px color-mix(in srgb, var(--cv-color-shadow) 15%, transparent)',
  'level3': '0 1px 3px color-mix(in srgb, var(--cv-color-shadow) 30%, transparent), 0 4px 8px 3px color-mix(in srgb, var(--cv-color-shadow) 15%, transparent)',
};

export const STATE_LAYER_OPACITY = { hover: 0.08, focus: 0.1, pressed: 0.1, dragged: 0.16, disabled: 0.38 } as const;

export interface TypeStyle {
  size: number; // px
  line: number; // px
  weight: number;
  tracking: number; // px
}
const base = (size: number, line: number, weight = 400, tracking = 0): TypeStyle => ({ size, line, weight, tracking });
export const TYPE_BASELINE: Record<string, TypeStyle> = {
  'display-large': base(57, 64, 400, -0.25),
  'display-medium': base(45, 52),
  'display-small': base(36, 44),
  'headline-large': base(32, 40),
  'headline-medium': base(28, 36),
  'headline-small': base(24, 32),
  'title-large': base(22, 28),
  'title-medium': base(16, 24, 500, 0.15),
  'title-small': base(14, 20, 500, 0.1),
  'body-large': base(16, 24, 400, 0.5),
  'body-medium': base(14, 20, 400, 0.25),
  'body-small': base(12, 16, 400, 0.4),
  'label-large': base(14, 20, 500, 0.1),
  'label-medium': base(12, 16, 500, 0.5),
  'label-small': base(11, 16, 500, 0.5),
};
/** Emphasized styles: same metrics, heavier weight (Expressive). */
export const TYPE_EMPHASIZED: Record<string, TypeStyle> = Object.fromEntries(
  Object.entries(TYPE_BASELINE).map(([k, v]) => [k, { ...v, weight: Math.min(700, v.weight + (k.startsWith('body') ? 200 : 100)) }]),
);

export const FONT_FAMILY = {
  brand: '"Roboto Flex", "Roboto", system-ui, sans-serif',
  plain: 'system-ui, "Roboto", "Noto Sans", sans-serif',
  mono: 'ui-monospace, "Roboto Mono", monospace',
} as const;

/** Critically/under-damped spring step response sampled to CSS linear() easing. */
export function springToLinear(spring: SpringToken, durationMs: number, samples = 24): string {
  const w0 = Math.sqrt(spring.stiffness); // mass = 1
  const z = spring.damping;
  const pts: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * (durationMs / 1000);
    let x: number;
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      x = 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
    } else {
      x = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    }
    pts.push(Math.round(x * 1000) / 1000);
  }
  pts[pts.length - 1] = 1;
  return `linear(${pts.join(', ')})`;
}
