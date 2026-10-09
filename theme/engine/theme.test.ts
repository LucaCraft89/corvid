import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, WCAG_AA_NON_TEXT, WCAG_AA_TEXT } from './contrast.ts';
import { generateRoles, ROLE_NAMES, type ContrastLevel, type RoleName, type SchemeMode, type Variant } from './scheme.ts';
import { resolveTheme, DEFAULT_PREFS } from './resolve.ts';
import { ThemeController } from './controller.ts';
import { seedFromPixels } from './seed.ts';
import type { ColorProvider, ProviderScheme } from '../providers/types.ts';

// (text role, background roles it is drawn on). Every pair must meet WCAG AA 4.5:1.
const TEXT_PAIRS: Array<[RoleName, RoleName[]]> = [
  ['onPrimary', ['primary']],
  ['onPrimaryContainer', ['primaryContainer']],
  ['onSecondary', ['secondary']],
  ['onSecondaryContainer', ['secondaryContainer']],
  ['onTertiary', ['tertiary']],
  ['onTertiaryContainer', ['tertiaryContainer']],
  ['onError', ['error']],
  ['onErrorContainer', ['errorContainer']],
  ['onBackground', ['background']],
  ['onSurface', ['surface', 'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest', 'surfaceVariant']],
  ['onSurfaceVariant', ['surface', 'surfaceVariant']],
  ['inverseOnSurface', ['inverseSurface']],
  ['inversePrimary', ['inverseSurface']],
  ['onPrimaryFixed', ['primaryFixed', 'primaryFixedDim']],
  ['onSecondaryFixed', ['secondaryFixed', 'secondaryFixedDim']],
  ['onTertiaryFixed', ['tertiaryFixed', 'tertiaryFixedDim']],
  ['onPrimaryFixedVariant', ['primaryFixed']],
  ['onSecondaryFixedVariant', ['secondaryFixed']],
  ['onTertiaryFixedVariant', ['tertiaryFixed']],
];

const SEEDS = ['#6750a4', '#3584e4', '#2190a4', '#3a944a', '#c88800', '#ed5b00', '#e62d42', '#d56199', '#9141ac', '#6f8396', '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#808080'];
const MODES: SchemeMode[] = ['light', 'dark'];
const CONTRASTS: ContrastLevel[] = ['standard', 'medium', 'high'];

test('WCAG AA text contrast holds for all text roles (all seeds x modes x contrast levels, tonal-spot)', () => {
  const failures: string[] = [];
  let checked = 0;
  for (const seed of SEEDS) for (const mode of MODES) for (const contrast of CONTRASTS) {
    const r = generateRoles({ seed, mode, contrast });
    for (const [fg, bgs] of TEXT_PAIRS) for (const bg of bgs) {
      checked++;
      const ratio = contrastRatio(r[fg], r[bg]);
      if (ratio < WCAG_AA_TEXT) failures.push(`${seed} ${mode} ${contrast}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
    }
  }
  assert.equal(failures.length, 0, `${failures.length}/${checked} below 4.5:\n${failures.slice(0, 20).join('\n')}`);
});

test('WCAG AA text contrast for core pairs holds for every variant', () => {
  const core = TEXT_PAIRS.filter(([fg]) => ['onPrimary', 'onPrimaryContainer', 'onSurface', 'onSurfaceVariant', 'onError', 'onSecondaryContainer', 'onTertiaryContainer', 'onBackground'].includes(fg));
  const variants: Variant[] = ['expressive', 'tonal-spot', 'vibrant', 'neutral', 'content', 'fidelity', 'fruit-salad', 'rainbow', 'monochrome'];
  const failures: string[] = [];
  for (const variant of variants) for (const seed of SEEDS.slice(0, 9)) for (const mode of MODES) {
    const r = generateRoles({ seed, mode, variant });
    for (const [fg, bgs] of core) for (const bg of bgs) {
      const ratio = contrastRatio(r[fg], r[bg]);
      if (ratio < WCAG_AA_TEXT) failures.push(`${variant} ${seed} ${mode}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
    }
  }
  assert.equal(failures.length, 0, failures.slice(0, 20).join('\n'));
});

test('outline meets 3:1 non-text contrast on surface at medium/high contrast', () => {
  for (const seed of SEEDS) for (const mode of MODES) for (const contrast of ['medium', 'high'] as const) {
    const r = generateRoles({ seed, mode, contrast });
    assert.ok(contrastRatio(r.outline, r.surface) >= WCAG_AA_NON_TEXT, `${seed} ${mode} ${contrast}`);
  }
});

test('high contrast is strictly stronger than standard for onSurfaceVariant', () => {
  const std = generateRoles({ seed: '#3584e4', mode: 'light', contrast: 'standard' });
  const hi = generateRoles({ seed: '#3584e4', mode: 'light', contrast: 'high' });
  assert.ok(contrastRatio(hi.onSurfaceVariant, hi.surface) > contrastRatio(std.onSurfaceVariant, std.surface));
});

test('roles are complete valid hex', () => {
  const r = generateRoles({ seed: '#3584e4', mode: 'dark' });
  for (const n of ROLE_NAMES) assert.match(r[n], /^#[0-9a-f]{6}$/);
});

test('tonal-spot primary hue follows the seed (blue seed stays blue)', () => {
  const r = generateRoles({ seed: '#3584e4', mode: 'light' });
  const [R, , B] = [parseInt(r.primary.slice(1, 3), 16), 0, parseInt(r.primary.slice(5, 7), 16)];
  assert.ok(B > R, `primary ${r.primary} should be blue-ish`);
});

test('invalid seed rejected', () => {
  assert.throws(() => generateRoles({ seed: 'nope', mode: 'light' }));
});

test('resolveTheme precedence: manual seed beats system accent; mode override beats system', () => {
  const sys: ProviderScheme = { mode: 'dark', contrast: 'high', accent: '#3a944a' };
  assert.deepEqual(
    (({ seed, seedSource, mode, contrast }) => ({ seed, seedSource, mode, contrast }))(resolveTheme(DEFAULT_PREFS, sys)),
    { seed: '#3a944a', seedSource: 'system', mode: 'dark', contrast: 'high' },
  );
  const o = resolveTheme({ ...DEFAULT_PREFS, seed: '#ff0000', mode: 'light', contrast: 'standard' }, sys);
  assert.equal(o.seed, '#ff0000');
  assert.equal(o.seedSource, 'user');
  assert.equal(o.mode, 'light');
  assert.equal(o.contrast, 'standard');
  const nofollow = resolveTheme({ ...DEFAULT_PREFS, followSystemAccent: false }, sys);
  assert.equal(nofollow.seedSource, 'default');
  assert.equal(resolveTheme(DEFAULT_PREFS, undefined).mode, 'light');
});

class FakeProvider implements ColorProvider {
  cbs: Array<(s: ProviderScheme) => void> = [];
  s: ProviderScheme;
  constructor(s: ProviderScheme) { this.s = s; }
  async getScheme() { return this.s; }
  onChange(cb: (s: ProviderScheme) => void) { this.cbs.push(cb); return () => { this.cbs = this.cbs.filter((c) => c !== cb); }; }
  emit(s: ProviderScheme) { this.s = s; this.cbs.forEach((c) => c(s)); }
}
function fakeRoot() {
  const props = new Map<string, string>();
  const attrs = new Map<string, string>();
  return { props, attrs, style: { setProperty: (k: string, v: string) => void props.set(k, v) }, setAttribute: (k: string, v: string) => void attrs.set(k, v) };
}

test('ThemeController recolors live on provider change, user seed wins, stop() unsubscribes', async () => {
  const p = new FakeProvider({ mode: 'light', contrast: 'standard', accent: '#3584e4' });
  const c = new ThemeController(p);
  const root = fakeRoot();
  c.attach(root);
  await c.start();
  const before = root.props.get('--cv-color-primary');
  assert.equal(root.attrs.get('data-theme'), 'light');
  const t0 = performance.now();
  p.emit({ mode: 'dark', contrast: 'standard', accent: '#e62d42' });
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 1000, `recolor took ${elapsed}ms`);
  assert.equal(root.attrs.get('data-theme'), 'dark');
  assert.notEqual(root.props.get('--cv-color-primary'), before);
  c.setPrefs({ seed: '#3a944a' });
  const withUser = root.props.get('--cv-color-primary');
  p.emit({ mode: 'dark', contrast: 'standard', accent: '#9141ac' });
  assert.equal(root.props.get('--cv-color-primary'), withUser, 'system accent must not override manual seed');
  c.stop();
  assert.equal(p.cbs.length, 0);
});

test('ThemeController survives provider failure (fallback scheme)', async () => {
  const bad: ColorProvider = { getScheme: async () => { throw new Error('no portal'); }, onChange: () => () => {} };
  const c = new ThemeController(bad);
  const root = fakeRoot();
  c.attach(root);
  await c.start();
  assert.equal(c.resolved.mode, 'light');
  assert.ok(root.props.has('--cv-color-primary'));
});

test('seedFromPixels picks dominant saturated color and falls back on empty', () => {
  const blue = (0xff << 24 | 0x35 << 16 | 0x84 << 8 | 0xe4) >>> 0;
  const grey = (0xff << 24 | 0x80 << 16 | 0x80 << 8 | 0x80) >>> 0;
  const px = [...Array(900).fill(blue), ...Array(100).fill(grey)];
  const seed = seedFromPixels(px);
  assert.match(seed, /^#[0-9a-f]{6}$/);
  assert.ok(parseInt(seed.slice(5, 7), 16) > parseInt(seed.slice(1, 3), 16), `seed ${seed} should be blue-ish`);
  assert.equal(seedFromPixels([]), '#6750a4');
});
