// Combine user preferences with the platform provider. User override always wins.
import { DEFAULT_SEED, DEFAULT_VARIANT, normalizeHex, type ContrastLevel, type SchemeMode, type Variant } from './scheme.ts';
import { FALLBACK_SCHEME, type ProviderScheme } from '../providers/types.ts';

export interface UserThemePrefs {
  /** Manual seed override (#rrggbb). Wins over system accent. */
  seed?: string | undefined;
  /** If false, the system accent is ignored (default seed used when no manual seed). */
  followSystemAccent: boolean;
  mode: 'auto' | SchemeMode;
  contrast: 'system' | ContrastLevel;
  variant: Variant;
}

export const DEFAULT_PREFS: UserThemePrefs = {
  followSystemAccent: true,
  mode: 'auto',
  contrast: 'system',
  variant: DEFAULT_VARIANT,
};

export interface ResolvedTheme {
  seed: string;
  seedSource: 'user' | 'system' | 'default';
  mode: SchemeMode;
  contrast: ContrastLevel;
  variant: Variant;
}

export function resolveTheme(prefs: UserThemePrefs, provider: ProviderScheme | undefined): ResolvedTheme {
  const sys = provider ?? FALLBACK_SCHEME;
  let seed = DEFAULT_SEED;
  let seedSource: ResolvedTheme['seedSource'] = 'default';
  if (prefs.seed) {
    seed = normalizeHex(prefs.seed);
    seedSource = 'user';
  } else if (prefs.followSystemAccent && sys.accent) {
    seed = normalizeHex(sys.accent);
    seedSource = 'system';
  }
  return {
    seed,
    seedSource,
    mode: prefs.mode === 'auto' ? sys.mode : prefs.mode,
    contrast: prefs.contrast === 'system' ? sys.contrast : prefs.contrast,
    variant: prefs.variant,
  };
}
