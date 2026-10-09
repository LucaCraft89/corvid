// Tonal-palette engine: seed color + options -> full M3 role set (hex).
// Uses Google's material-color-utilities (Apache-2.0).
import {
  Hct,
  MaterialDynamicColors,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeFruitSalad,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeRainbow,
  SchemeTonalSpot,
  SchemeVibrant,
  argbFromHex,
  hexFromArgb,
  type DynamicScheme,
} from '@material/material-color-utilities';

export type SchemeMode = 'light' | 'dark';
export type ContrastLevel = 'standard' | 'medium' | 'high';
export type Variant =
  | 'expressive'
  | 'tonal-spot'
  | 'vibrant'
  | 'neutral'
  | 'content'
  | 'fidelity'
  | 'fruit-salad'
  | 'rainbow'
  | 'monochrome';

export const DEFAULT_SEED = '#6750a4';
export const DEFAULT_VARIANT: Variant = 'tonal-spot';

const CONTRAST_VALUE: Record<ContrastLevel, number> = { standard: 0, medium: 0.5, high: 1 };

/** Role name (camelCase, as in MaterialDynamicColors) -> accessor. Order is the output order. */
export const ROLE_NAMES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground',
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest',
  'outline', 'outlineVariant', 'shadow', 'scrim', 'surfaceTint',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary',
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
  'secondaryFixed', 'secondaryFixedDim', 'onSecondaryFixed', 'onSecondaryFixedVariant',
  'tertiaryFixed', 'tertiaryFixedDim', 'onTertiaryFixed', 'onTertiaryFixedVariant',
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];
export type Roles = Record<RoleName, string>;

export interface SchemeOptions {
  seed: string;
  mode: SchemeMode;
  contrast?: ContrastLevel;
  variant?: Variant;
}

type Ctor = new (hct: Hct, isDark: boolean, contrast: number) => DynamicScheme;
const VARIANTS: Record<Variant, Ctor> = {
  expressive: SchemeExpressive as unknown as Ctor,
  'tonal-spot': SchemeTonalSpot as unknown as Ctor,
  vibrant: SchemeVibrant as unknown as Ctor,
  neutral: SchemeNeutral as unknown as Ctor,
  content: SchemeContent as unknown as Ctor,
  fidelity: SchemeFidelity as unknown as Ctor,
  'fruit-salad': SchemeFruitSalad as unknown as Ctor,
  rainbow: SchemeRainbow as unknown as Ctor,
  monochrome: SchemeMonochrome as unknown as Ctor,
};

export function normalizeHex(input: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) throw new Error(`invalid seed color: ${input}`);
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return `#${h}`;
}

export function generateRoles(opts: SchemeOptions): Roles {
  const seed = normalizeHex(opts.seed);
  const Scheme = VARIANTS[opts.variant ?? DEFAULT_VARIANT];
  if (!Scheme) throw new Error(`unknown variant: ${opts.variant}`);
  const scheme = new Scheme(
    Hct.fromInt(argbFromHex(seed)),
    opts.mode === 'dark',
    CONTRAST_VALUE[opts.contrast ?? 'standard'],
  );
  const out = {} as Roles;
  const md = MaterialDynamicColors as unknown as Record<string, { getArgb(s: DynamicScheme): number }>;
  for (const name of ROLE_NAMES) {
    const dc = md[name];
    if (!dc) throw new Error(`material-color-utilities has no role ${name}`);
    out[name] = hexFromArgb(dc.getArgb(scheme)).toLowerCase();
  }
  return out;
}
