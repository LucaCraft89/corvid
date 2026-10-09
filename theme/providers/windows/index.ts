// Windows color provider (task 3.5). Implements the provider interface from
// skills/platform-color-provider: getScheme(): Scheme, onChange(cb).
//
// Split: native glue (src-overlay/corvid/windows/accent/, C++ UISettings, UNVERIFIED) pushes RAW
// readings through a WindowsBridge. This file is pure logic and is unit-tested on Linux with a fake bridge.
// Provider output feeds theme-m3e only; user override (seed/wallpaper/fixed scheme) always wins.

export type Mode = 'light' | 'dark';
export type Contrast = 'normal' | 'high';

export interface Scheme {
  mode: Mode;
  contrast: Contrast;
  /** #RRGGBB. Absent when the OS gave no usable accent (caller falls back to its seed). */
  accent?: string;
  /** True when Windows high-contrast (contrast themes) is active: engine must use system colors. */
  forcedColors: boolean;
  source: 'windows-uisettings' | 'fallback';
}

/** Raw readings from the native side. Colors are 0xAARRGGBB as UISettings reports them. */
export interface RawReading {
  accentArgb?: number;
  /** UIColorType.Foreground ARGB; light foreground => dark app theme. Preferred over registry. */
  foregroundArgb?: number;
  /** HKCU ...\Themes\Personalize\AppsUseLightTheme (0 = dark), fallback when foreground is absent. */
  appsUseLightTheme?: 0 | 1;
  highContrast?: boolean;
}

export interface WindowsBridge {
  /** Returns null if UISettings is unavailable (e.g. Windows 10 N edition w/o WinRT, or init failure). */
  read(): RawReading | null;
  /** Native ColorValuesChanged / HighContrast change callback. Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
}

export interface Override {
  seed?: string;
  mode?: Mode;
}

export function argbToHex(argb: number): string {
  const rgb = argb & 0xffffff;
  return '#' + rgb.toString(16).padStart(6, '0');
}

function relativeLuminance(argb: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = (argb >> 16) & 0xff, g = (argb >> 8) & 0xff, b = argb & 0xff;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function resolveMode(raw: RawReading): Mode {
  if (raw.foregroundArgb !== undefined) {
    // Light foreground text means the app theme is dark (the well-known UISettings trick).
    return relativeLuminance(raw.foregroundArgb) > 0.5 ? 'dark' : 'light';
  }
  if (raw.appsUseLightTheme !== undefined) return raw.appsUseLightTheme === 0 ? 'dark' : 'light';
  return 'light';
}

const FALLBACK: Scheme = { mode: 'light', contrast: 'normal', forcedColors: false, source: 'fallback' };

export function toScheme(raw: RawReading | null, override?: Override): Scheme {
  let s: Scheme;
  if (!raw) {
    s = { ...FALLBACK };
  } else {
    const opaqueAccent = raw.accentArgb !== undefined && ((raw.accentArgb >>> 24) & 0xff) !== 0;
    s = {
      mode: resolveMode(raw),
      contrast: raw.highContrast ? 'high' : 'normal',
      forcedColors: !!raw.highContrast,
      accent: opaqueAccent ? argbToHex(raw.accentArgb!) : undefined,
      source: 'windows-uisettings',
    };
  }
  if (override?.mode) s.mode = override.mode;
  if (override?.seed && !s.forcedColors) s.accent = override.seed; // forced colors cannot be overridden
  return s;
}

export interface WindowsProviderOptions {
  bridge: WindowsBridge;
  override?: () => Override | undefined;
  /** Coalesce bursts (Windows fires several notifications per change). Default 50 ms; spec budget is 1 s. */
  debounceMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (h: unknown) => void;
}

export function createWindowsProvider(opts: WindowsProviderOptions) {
  const debounceMs = opts.debounceMs ?? 50;
  const st = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const ct = opts.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const listeners = new Set<(s: Scheme) => void>();
  let last: Scheme = getScheme();
  let timer: unknown;
  let unsub: (() => void) | undefined;

  function getScheme(): Scheme {
    let raw: RawReading | null = null;
    try { raw = opts.bridge.read(); } catch { raw = null; }
    return toScheme(raw, opts.override?.());
  }

  function sameScheme(a: Scheme, b: Scheme) {
    return a.mode === b.mode && a.contrast === b.contrast && a.accent === b.accent &&
      a.forcedColors === b.forcedColors && a.source === b.source;
  }

  function flush() {
    timer = undefined;
    const next = getScheme();
    if (sameScheme(next, last)) return; // no spurious repaint
    last = next;
    listeners.forEach((cb) => cb(next));
  }

  function onNative() {
    if (timer !== undefined) ct(timer);
    timer = st(flush, debounceMs);
  }

  return {
    getScheme,
    onChange(cb: (s: Scheme) => void): () => void {
      if (listeners.size === 0) unsub = opts.bridge.subscribe(onNative);
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0) { unsub?.(); unsub = undefined; }
      };
    },
    /** Call when the user changes override settings so the engine re-evaluates. */
    refresh: onNative,
  };
}
