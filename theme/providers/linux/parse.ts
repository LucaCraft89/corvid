// Pure parsers for Linux appearance sources. No I/O: callers supply text/values.
import { toHex } from '../../engine/contrast.ts';
import type { ContrastLevel, SchemeMode } from '../../engine/scheme.ts';
import { relativeLuminance } from '../../engine/contrast.ts';

// ---- xdg-desktop-portal org.freedesktop.appearance ----

/** color-scheme: 0 no preference, 1 prefer dark, 2 prefer light. */
export function parsePortalColorScheme(v: unknown): SchemeMode | undefined {
  if (v === 1) return 'dark';
  if (v === 2) return 'light';
  return undefined;
}

/** contrast: 0 no preference, 1 higher contrast. */
export function parsePortalContrast(v: unknown): ContrastLevel | undefined {
  if (v === 1) return 'high';
  if (v === 0) return 'standard';
  return undefined;
}

/** accent-color: (ddd) sRGB 0..1. Values outside the range mean "unset". */
export function parsePortalAccent(v: unknown): string | undefined {
  if (!Array.isArray(v) || v.length !== 3) return undefined;
  const c = v as unknown[];
  if (!c.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) return undefined;
  return toHex(...(c.map((n) => (n as number) * 255) as [number, number, number]));
}

// ---- generic INI ----

export type Ini = Record<string, Record<string, string>>;
export function parseIni(text: string): Ini {
  const out: Ini = {};
  let sec = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const m = /^\[(.+)\]$/.exec(line);
    if (m) { sec = m[1]!; out[sec] ??= {}; continue; }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    (out[sec] ??= {})[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

// ---- CSS colors / GTK named colors ----

export function parseCssColor(value: string): string | undefined {
  const v = value.trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  if (m) {
    let h = m[1]!;
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return `#${h.slice(0, 6).toLowerCase()}`;
  }
  m = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i.exec(v);
  if (m) return toHex(Number(m[1]), Number(m[2]), Number(m[3]));
  return undefined;
}

/** Extract `@define-color name value;` entries, resolving `@other` references. Functions (shade, mix) are skipped. */
export function parseDefineColors(css: string): Record<string, string> {
  const raw: Record<string, string> = {};
  const re = /@define-color\s+([\w-]+)\s+([^;]+);/g;
  for (let m = re.exec(css); m; m = re.exec(css)) raw[m[1]!] = m[2]!.trim();
  const out: Record<string, string> = {};
  const resolve = (name: string, depth = 0): string | undefined => {
    const v = raw[name];
    if (v === undefined || depth > 8) return undefined;
    const ref = /^@([\w-]+)$/.exec(v);
    return ref ? resolve(ref[1]!, depth + 1) : parseCssColor(v);
  };
  for (const k of Object.keys(raw)) {
    const r = resolve(k);
    if (r) out[k] = r;
  }
  return out;
}

/** libadwaita / GNOME accent names (org.gnome.desktop.interface accent-color). Values: libadwaita accent_bg_color palette (from memory; verify against libadwaita). */
export const GNOME_ACCENTS: Record<string, string> = {
  blue: '#3584e4', teal: '#2190a4', green: '#3a944a', yellow: '#c88800',
  orange: '#ed5b00', red: '#e62d42', pink: '#d56199', purple: '#9141ac', slate: '#6f8396',
};

/** Parse `gsettings get org.gnome.desktop.interface accent-color` output, e.g. "'purple'". */
export function parseGsettingsAccent(out: string): string | undefined {
  const name = /'([a-z]+)'/.exec(out.trim())?.[1];
  return name ? GNOME_ACCENTS[name] : undefined;
}
/** Parse `gsettings get org.gnome.desktop.interface color-scheme`: 'prefer-dark' | 'prefer-light' | 'default'. */
export function parseGsettingsColorScheme(out: string): SchemeMode | undefined {
  const v = /'([a-z-]+)'/.exec(out.trim())?.[1];
  return v === 'prefer-dark' ? 'dark' : v === 'prefer-light' ? 'light' : undefined;
}

// ---- GTK settings.ini ----

export interface GtkSettings {
  themeName?: string;
  preferDark?: boolean;
}
export function parseGtkSettings(text: string): GtkSettings {
  const s = parseIni(text)['Settings'] ?? {};
  const out: GtkSettings = {};
  if (s['gtk-theme-name']) out.themeName = s['gtk-theme-name'];
  if (s['gtk-application-prefer-dark-theme'] !== undefined) out.preferDark = /^(1|true)$/i.test(s['gtk-application-prefer-dark-theme']);
  return out;
}
export function gtkSettingsMode(g: GtkSettings): SchemeMode | undefined {
  if (g.preferDark) return 'dark';
  if (g.themeName && /(-|:)dark$|dark/i.test(g.themeName)) return 'dark';
  if (g.themeName || g.preferDark === false) return 'light';
  return undefined;
}
/** Accent from GTK named colors, in preference order. */
export function gtkAccent(named: Record<string, string>): string | undefined {
  return named['accent_bg_color'] ?? named['accent_color'] ?? named['theme_selected_bg_color'] ?? named['selected_bg_color'];
}

// ---- KDE kdeglobals ----

export interface KdeAppearance {
  colorScheme?: string;
  accent?: string;
  mode?: SchemeMode;
}
function rgbTriple(v: string | undefined): string | undefined {
  const m = v && /^(\d{1,3}),(\d{1,3}),(\d{1,3})/.exec(v.replace(/\s/g, ''));
  return m ? toHex(+m[1]!, +m[2]!, +m[3]!) : undefined;
}
/** Plasma 6 writes [General] AccentColor=r,g,b when an accent is set; fall back to selection background. Dark/light is derived from window background luminance. */
export function parseKdeglobals(text: string): KdeAppearance {
  const ini = parseIni(text);
  const out: KdeAppearance = {};
  const scheme = ini['General']?.['ColorScheme'];
  if (scheme) out.colorScheme = scheme;
  const accent = rgbTriple(ini['General']?.['AccentColor']) ?? rgbTriple(ini['Colors:Selection']?.['BackgroundNormal']);
  if (accent) out.accent = accent;
  const win = rgbTriple(ini['Colors:Window']?.['BackgroundNormal']);
  if (win) out.mode = relativeLuminance(win) < 0.18 ? 'dark' : 'light';
  else if (scheme) out.mode = /dark/i.test(scheme) ? 'dark' : 'light';
  return out;
}
