// Provider interface shared by all platforms (see skills/platform-color-provider).
import type { ContrastLevel, SchemeMode } from '../engine/scheme.ts';

export interface ProviderScheme {
  mode: SchemeMode;
  contrast: ContrastLevel;
  /** System accent as #rrggbb, when the platform exposes one. */
  accent?: string;
  /** Optional full palette hints (platform tonal colors). Unused by v0 engine. */
  palette?: string[];
}

export interface ColorProvider {
  getScheme(): Promise<ProviderScheme>;
  /** Returns an unsubscribe function. */
  onChange(cb: (s: ProviderScheme) => void): () => void;
}

export const FALLBACK_SCHEME: ProviderScheme = { mode: 'light', contrast: 'standard' };
