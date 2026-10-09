// Linux color provider. Transport-agnostic: the browser process (C++, see
// src-overlay/corvid/theme/) supplies LinuxSources over Mojo; tests supply fakes.
// Resolution order is documented in docs/ (platform-color-provider skill):
//   portal (org.freedesktop.appearance) > gsettings > GTK files > kdeglobals > fallback.
import type { ColorProvider, ProviderScheme } from '../types.ts';
import { FALLBACK_SCHEME } from '../types.ts';
import {
  gtkAccent, gtkSettingsMode, parseDefineColors, parseGsettingsAccent, parseGsettingsColorScheme,
  parseGtkSettings, parseKdeglobals, parsePortalAccent, parsePortalColorScheme, parsePortalContrast,
} from './parse.ts';

export type PortalKey = 'color-scheme' | 'contrast' | 'accent-color';

export interface LinuxSources {
  /** Value of org.freedesktop.appearance <key>, or undefined if the portal/key is unavailable. */
  readPortal(key: PortalKey): Promise<unknown>;
  /** Subscribe to SettingChanged for namespace org.freedesktop.appearance. */
  onPortalChanged(cb: (key: string) => void): () => void;
  /** Read a text file from the fixed allow-list below; undefined if absent. */
  readFile(path: string): Promise<string | undefined>;
  /** Notify when any of the allow-listed files change. */
  watchFiles(cb: () => void): () => void;
  /** `gsettings get org.gnome.desktop.interface <key>` stdout, if available. */
  readGsettings?(key: 'color-scheme' | 'accent-color'): Promise<string | undefined>;
  /** XDG_CURRENT_DESKTOP, e.g. "KDE" or "GNOME" or "ubuntu:GNOME". */
  desktop: string;
}

/** Files the host is allowed to hand to the renderer (relative to XDG_CONFIG_HOME). */
export const ALLOWED_CONFIG_FILES = [
  'gtk-4.0/settings.ini', 'gtk-3.0/settings.ini', 'gtk-4.0/gtk.css', 'gtk-3.0/gtk.css', 'gtk-4.0/colors.css', 'kdeglobals',
] as const;

export class LinuxColorProvider implements ColorProvider {
  private src: LinuxSources;
  private last = '';
  constructor(src: LinuxSources) {
    this.src = src;
  }

  async getScheme(): Promise<ProviderScheme> {
    const s = this.src;
    const isKde = /kde|plasma/i.test(s.desktop);
    const [pScheme, pContrast, pAccent] = await Promise.all([
      safe(() => s.readPortal('color-scheme')), safe(() => s.readPortal('contrast')), safe(() => s.readPortal('accent-color')),
    ]);
    const [gsScheme, gsAccent] = s.readGsettings
      ? await Promise.all([safe(() => s.readGsettings!('color-scheme')), safe(() => s.readGsettings!('accent-color'))])
      : [undefined, undefined];
    const files = await Promise.all(ALLOWED_CONFIG_FILES.map((f) => safe(() => s.readFile(f))));
    const byName = Object.fromEntries(ALLOWED_CONFIG_FILES.map((f, i) => [f, files[i]]));
    const gtk = parseGtkSettings(byName['gtk-4.0/settings.ini'] ?? byName['gtk-3.0/settings.ini'] ?? '');
    const named = Object.assign({}, ...['gtk-3.0/gtk.css', 'gtk-4.0/gtk.css', 'gtk-4.0/colors.css'].map((f) => parseDefineColors(byName[f] ?? '')));
    const kde = parseKdeglobals(byName['kdeglobals'] ?? '');

    const gtkMode = gtkSettingsMode(gtk);
    const mode =
      parsePortalColorScheme(pScheme) ??
      (typeof gsScheme === 'string' ? parseGsettingsColorScheme(gsScheme) : undefined) ??
      (isKde ? kde.mode ?? gtkMode : gtkMode ?? kde.mode) ??
      FALLBACK_SCHEME.mode;
    const accent =
      parsePortalAccent(pAccent) ??
      (isKde ? kde.accent : undefined) ??
      (typeof gsAccent === 'string' ? parseGsettingsAccent(gsAccent) : undefined) ??
      gtkAccent(named);
    const contrast = parsePortalContrast(pContrast) ?? FALLBACK_SCHEME.contrast;
    const out: ProviderScheme = { mode, contrast };
    if (accent) out.accent = accent;
    return out;
  }

  onChange(cb: (s: ProviderScheme) => void): () => void {
    let alive = true;
    const refresh = () => {
      void this.getScheme().then((s) => {
        const key = JSON.stringify(s);
        if (!alive || key === this.last) return;
        this.last = key;
        cb(s);
      });
    };
    void this.getScheme().then((s) => { this.last = JSON.stringify(s); });
    const u1 = this.src.onPortalChanged(refresh);
    const u2 = this.src.watchFiles(refresh);
    return () => { alive = false; u1(); u2(); };
  }
}

async function safe<T>(f: () => Promise<T>): Promise<T | undefined> {
  try { return await f(); } catch { return undefined; }
}
