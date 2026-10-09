// UNVERIFIED: not built. WebUI-side Android provider; the bridge (`corvid.mojom.PlatformColors`) does not exist yet.
// Contract from skills/platform-color-provider: getScheme() and onChange(cb). Output feeds theme-m3e only.

export type Mode = 'light' | 'dark';
export interface Scheme {
  mode: Mode;
  contrast: number;                         // -1..1
  accent?: string;                          // '#rrggbb'
  palette?: Record<string, string[]>;       // 'accent1' -> tone colors; absent below Android 12 => engine uses seed
}

interface NativeScheme {
  dark: boolean;
  contrast: number;
  accent: number | null;                    // ARGB int
  palette: Record<string, number[]> | null;
}
interface PlatformColorsBridge {
  getScheme(): Promise<NativeScheme>;
  addListener(cb: (s: NativeScheme) => void): void;
}

const hex = (argb: number) => '#' + (argb & 0xffffff).toString(16).padStart(6, '0');

function convert(n: NativeScheme): Scheme {
  const s: Scheme = { mode: n.dark ? 'dark' : 'light', contrast: n.contrast };
  if (n.accent !== null) s.accent = hex(n.accent);
  if (n.palette) s.palette = Object.fromEntries(Object.entries(n.palette).map(([k, v]) => [k, v.map(hex)]));
  return s;
}

export function createAndroidProvider(bridge: PlatformColorsBridge) {
  return {
    async getScheme(): Promise<Scheme> { return convert(await bridge.getScheme()); },
    onChange(cb: (s: Scheme) => void) { bridge.addListener(n => cb(convert(n))); },
  };
}
