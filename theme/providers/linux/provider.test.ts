import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  gtkAccent, gtkSettingsMode, parseDefineColors, parseGsettingsAccent, parseGsettingsColorScheme,
  parseGtkSettings, parseKdeglobals, parsePortalAccent, parsePortalColorScheme, parsePortalContrast,
} from './parse.ts';
import { LinuxColorProvider, type LinuxSources, type PortalKey } from './provider.ts';
import type { ProviderScheme } from '../types.ts';

const fx = (n: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url)), 'utf8');

test('portal parsers', () => {
  assert.equal(parsePortalColorScheme(1), 'dark');
  assert.equal(parsePortalColorScheme(2), 'light');
  assert.equal(parsePortalColorScheme(0), undefined);
  assert.equal(parsePortalContrast(1), 'high');
  assert.equal(parsePortalContrast(0), 'standard');
  assert.equal(parsePortalAccent([0.2078, 0.5176, 0.8941]), '#3584e4');
  assert.equal(parsePortalAccent([-1, -1, -1]), undefined, 'out of range = unset');
  assert.equal(parsePortalAccent([1, 2, 3]), undefined);
  assert.equal(parsePortalAccent('x'), undefined);
});

test('gsettings parsers', () => {
  assert.equal(parseGsettingsAccent("'purple'\n"), '#9141ac');
  assert.equal(parseGsettingsAccent("'nonsense'"), undefined);
  assert.equal(parseGsettingsColorScheme("'prefer-dark'"), 'dark');
  assert.equal(parseGsettingsColorScheme("'default'"), undefined);
});

test('kdeglobals fixtures', () => {
  const dark = parseKdeglobals(fx('kdeglobals-breeze-dark'));
  assert.deepEqual(dark, { colorScheme: 'BreezeDark', accent: '#9251af', mode: 'dark' });
  const light = parseKdeglobals(fx('kdeglobals-breeze-light-noaccent'));
  assert.equal(light.mode, 'light');
  assert.equal(light.accent, '#3daee9', 'falls back to selection background, tolerates spaces');
  assert.deepEqual(parseKdeglobals(''), {});
});

test('GTK fixtures', () => {
  const g4 = parseGtkSettings(fx('gtk4-settings.ini'));
  assert.deepEqual(g4, { themeName: 'Adwaita-dark', preferDark: true });
  assert.equal(gtkSettingsMode(g4), 'dark');
  assert.equal(gtkSettingsMode(parseGtkSettings(fx('gtk3-settings-light.ini'))), 'light');
  assert.equal(gtkSettingsMode({}), undefined);
  const named = parseDefineColors(fx('gtk.css'));
  assert.equal(named['accent_bg_color'], '#3584e4', 'reference resolved');
  assert.equal(named['accent_color'], '#1a5fb4', 'rgb() parsed');
  assert.equal(named['window_bg_color'], undefined, 'shade() is skipped, not guessed');
  assert.equal(gtkAccent(named), '#3584e4');
});

interface FakeState {
  portal: Partial<Record<PortalKey, unknown>>;
  files: Record<string, string>;
  gs: Record<string, string>;
  desktop: string;
}
function fakeSources(st: FakeState) {
  const portalCbs = new Set<(k: string) => void>();
  const fileCbs = new Set<() => void>();
  const src: LinuxSources = {
    desktop: st.desktop,
    readPortal: async (k) => st.portal[k],
    onPortalChanged: (cb) => { portalCbs.add(cb); return () => portalCbs.delete(cb); },
    readFile: async (p) => st.files[p],
    watchFiles: (cb) => { fileCbs.add(cb); return () => fileCbs.delete(cb); },
    readGsettings: async (k) => st.gs[k],
  };
  return { src, firePortal: (k: string) => portalCbs.forEach((c) => c(k)), fireFile: () => fileCbs.forEach((c) => c()), portalCbs, fileCbs };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('GNOME: portal accent + dark', async () => {
  const f = fakeSources({ portal: { 'color-scheme': 1, 'accent-color': [0.5686, 0.2549, 0.6745], contrast: 0 }, files: {}, gs: {}, desktop: 'GNOME' });
  const s = await new LinuxColorProvider(f.src).getScheme();
  assert.deepEqual(s, { mode: 'dark', contrast: 'standard', accent: '#9141ac' });
});

test('GNOME without portal accent: falls back to gsettings accent then GTK named color', async () => {
  const a = fakeSources({ portal: { 'color-scheme': 2 }, files: {}, gs: { 'accent-color': "'green'" }, desktop: 'ubuntu:GNOME' });
  assert.equal((await new LinuxColorProvider(a.src).getScheme()).accent, '#3a944a');
  const b = fakeSources({ portal: {}, files: { 'gtk-4.0/gtk.css': fx('gtk.css'), 'gtk-4.0/settings.ini': fx('gtk4-settings.ini') }, gs: {}, desktop: 'GNOME' });
  assert.deepEqual(await new LinuxColorProvider(b.src).getScheme(), { mode: 'dark', contrast: 'standard', accent: '#3584e4' });
});

test('KDE: kdeglobals accent and scheme when portal missing', async () => {
  const f = fakeSources({ portal: {}, files: { kdeglobals: fx('kdeglobals-breeze-dark') }, gs: {}, desktop: 'KDE' });
  assert.deepEqual(await new LinuxColorProvider(f.src).getScheme(), { mode: 'dark', contrast: 'standard', accent: '#9251af' });
});

test('tiling WM with only a GTK theme: mode from GTK, no accent', async () => {
  const f = fakeSources({ portal: {}, files: { 'gtk-3.0/settings.ini': fx('gtk3-settings-light.ini') }, gs: {}, desktop: 'sway' });
  assert.deepEqual(await new LinuxColorProvider(f.src).getScheme(), { mode: 'light', contrast: 'standard' });
});

test('nothing available: fallback scheme; portal errors are swallowed', async () => {
  const f = fakeSources({ portal: {}, files: {}, gs: {}, desktop: '' });
  f.src.readPortal = async () => { throw new Error('no dbus'); };
  assert.deepEqual(await new LinuxColorProvider(f.src).getScheme(), { mode: 'light', contrast: 'standard' });
});

test('live updates: portal signal and file change emit once per actual change; unsubscribe cleans up', async () => {
  const st: FakeState = { portal: { 'color-scheme': 2, 'accent-color': [0.2078, 0.5176, 0.8941] }, files: {}, gs: {}, desktop: 'GNOME' };
  const f = fakeSources(st);
  const p = new LinuxColorProvider(f.src);
  const seen: ProviderScheme[] = [];
  const off = p.onChange((s) => seen.push(s));
  await tick();
  f.firePortal('color-scheme');
  await tick();
  assert.equal(seen.length, 0, 'no change -> no emit');
  st.portal['color-scheme'] = 1;
  const t0 = performance.now();
  f.firePortal('color-scheme');
  await tick();
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.mode, 'dark');
  assert.ok(performance.now() - t0 < 1000);
  st.portal['accent-color'] = [0.902, 0.1765, 0.2588];
  f.firePortal('accent-color');
  await tick();
  assert.equal(seen.length, 2);
  assert.equal(seen[1]!.accent, '#e62d42');
  off();
  assert.equal(f.portalCbs.size + f.fileCbs.size, 0);
});

test('KDE live update via kdeglobals watch', async () => {
  const st: FakeState = { portal: {}, files: { kdeglobals: fx('kdeglobals-breeze-light-noaccent') }, gs: {}, desktop: 'KDE' };
  const f = fakeSources(st);
  const seen: ProviderScheme[] = [];
  new LinuxColorProvider(f.src).onChange((s) => seen.push(s));
  await tick();
  st.files['kdeglobals'] = fx('kdeglobals-breeze-dark');
  f.fireFile();
  await tick();
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.mode, 'dark');
  assert.equal(seen[0]!.accent, '#9251af');
});
