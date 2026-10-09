// ThemeController: provider + user prefs -> tokens -> applied to every registered root.
// Live: provider.onChange or setPrefs recompute and re-apply synchronously (no reload).
import { allTokens, type TokenMap } from '../tokens/css.ts';
import type { ColorProvider, ProviderScheme } from '../providers/types.ts';
import { DEFAULT_PREFS, resolveTheme, type ResolvedTheme, type UserThemePrefs } from './resolve.ts';

/** Anything with style.setProperty: document.documentElement, a ShadowRoot host, or a test fake. */
export interface TokenTarget {
  style: { setProperty(name: string, value: string): void; removeProperty?(name: string): string };
  setAttribute?(name: string, value: string): void;
}

export class ThemeController {
  private prefs: UserThemePrefs;
  private system: ProviderScheme | undefined;
  private targets = new Set<TokenTarget>();
  private listeners = new Set<(t: ResolvedTheme, tokens: TokenMap) => void>();
  private unsub: (() => void) | undefined;
  private lastTokens: TokenMap = {};
  resolved: ResolvedTheme;

  private provider: ColorProvider | undefined;

  constructor(provider: ColorProvider | undefined, prefs: Partial<UserThemePrefs> = {}) {
    this.provider = provider;
    this.prefs = { ...DEFAULT_PREFS, ...prefs };
    this.resolved = resolveTheme(this.prefs, undefined);
  }

  async start(): Promise<void> {
    if (this.provider) {
      try {
        this.system = await this.provider.getScheme();
      } catch {
        this.system = undefined; // provider unavailable: fallback scheme
      }
      this.unsub = this.provider.onChange((s) => {
        this.system = s;
        this.recompute();
      });
    }
    this.recompute();
  }

  stop(): void {
    this.unsub?.();
    this.unsub = undefined;
  }

  attach(target: TokenTarget): () => void {
    this.targets.add(target);
    this.paint(target);
    return () => this.targets.delete(target);
  }

  onChange(cb: (t: ResolvedTheme, tokens: TokenMap) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setPrefs(patch: Partial<UserThemePrefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    this.recompute();
  }

  getPrefs(): UserThemePrefs {
    return { ...this.prefs };
  }

  get tokens(): TokenMap {
    return this.lastTokens;
  }

  private recompute(): void {
    this.resolved = resolveTheme(this.prefs, this.system);
    const r = this.resolved;
    this.lastTokens = allTokens({ seed: r.seed, mode: r.mode, contrast: r.contrast, variant: r.variant });
    for (const t of this.targets) this.paint(t);
    for (const l of this.listeners) l(r, this.lastTokens);
  }

  private paint(t: TokenTarget): void {
    for (const [k, v] of Object.entries(this.lastTokens)) t.style.setProperty(k, v);
    t.setAttribute?.('data-theme', this.resolved.mode);
  }
}
