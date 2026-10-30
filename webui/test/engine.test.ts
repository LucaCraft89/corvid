// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOR_ROLES, CONTRAST_LEVELS, DEFAULT_SEED, PALETTE_STYLES,
  checkPalette, cssVarName, ensureContrast, makePalette, paletteToCss, primaryTones,
} from '../src/color/engine.js';
import { contrastRatio, isHexColor, luminance } from '../src/color/contrast.js';

// Presets, the hue wheel every 30 degrees, and awkward seeds (grey, black,
// white, pure yellow, very dark and very light colours).
const SEEDS = [
  DEFAULT_SEED, '#1E6FD9', '#006A6A', '#3F7A3A', '#C58A00', '#D2601A', '#B3261E', '#C2185B', '#7B4FB0',
  '#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080',
  '#000000', '#ffffff', '#808080', '#0a0a1a', '#fafaf0', '#3d2b1f',
];

test('every role is a hex colour', () => {
  const p = makePalette({ seed: DEFAULT_SEED, dark: false });
  assert.deepEqual(Object.keys(p).sort(), [...COLOR_ROLES].sort());
  for (const r of COLOR_ROLES) assert.ok(isHexColor(p[r]), `${r}=${p[r]}`);
});

test('same input gives the same palette', () => {
  assert.deepEqual(makePalette({ seed: '#1E6FD9', dark: true }), makePalette({ seed: '#1e6fd9', dark: true }));
});

test('dark palettes have dark surfaces, light palettes light ones', () => {
  for (const seed of SEEDS) {
    assert.ok(luminance(makePalette({ seed, dark: false }).surface) > 0.7, seed);
    assert.ok(luminance(makePalette({ seed, dark: true }).surface) < 0.05, seed);
  }
});

test('the primary colour follows the seed hue', () => {
  const red = makePalette({ seed: '#ff0000', dark: false }).primary;
  const blue = makePalette({ seed: '#0000ff', dark: false }).primary;
  const [rr, , rb] = [parseInt(red.slice(1, 3), 16), 0, parseInt(red.slice(5, 7), 16)];
  const [br, , bb] = [parseInt(blue.slice(1, 3), 16), 0, parseInt(blue.slice(5, 7), 16)];
  assert.ok(rr > rb, red);
  assert.ok(bb > br, blue);
});

test('WCAG AA holds for every seed, mode, contrast level and style', () => {
  let checked = 0;
  for (const seed of SEEDS) for (const dark of [false, true]) for (const contrast of CONTRAST_LEVELS) for (const style of PALETTE_STYLES) {
    const issues = checkPalette(makePalette({ seed, dark, contrast, style }));
    assert.deepEqual(issues, [], `${seed} dark=${dark} ${contrast} ${style}`);
    checked++;
  }
  assert.equal(checked, SEEDS.length * 2 * 3 * 4);
});

test('higher contrast levels give more contrast', () => {
  for (const seed of SEEDS) for (const dark of [false, true]) {
    const r = CONTRAST_LEVELS.map((contrast) => {
      const p = makePalette({ seed, dark, contrast });
      return contrastRatio(p.onSurfaceVariant, p.surface);
    });
    assert.ok(r[0]! <= r[1]! && r[1]! <= r[2]!, `${seed} dark=${dark} ${r.join(' ')}`);
    const high = makePalette({ seed, dark, contrast: 'high' });
    assert.ok(contrastRatio(high.onSurface, high.surface) >= 7, `${seed} high contrast reaches AAA for body text`);
  }
});

test('invalid seeds are refused', () => {
  assert.throws(() => makePalette({ seed: 'blue', dark: false }));
});

test('CSS output names every role', () => {
  const css = paletteToCss(makePalette({ seed: DEFAULT_SEED, dark: false }));
  for (const r of COLOR_ROLES) assert.ok(css.includes(cssVarName(r) + ':'), r);
  assert.ok(css.includes('--md-sys-color-on-primary-container:'));
});

test('tonal ramp goes from black to white', () => {
  const tones = primaryTones(DEFAULT_SEED);
  assert.equal(tones[0], '#000000');
  assert.equal(tones.at(-1), '#ffffff');
  for (let i = 1; i < tones.length; i++) assert.ok(luminance(tones[i]!) >= luminance(tones[i - 1]!));
});

test('ensureContrast darkens or lightens a failing colour until it passes', () => {
  const dark = ensureContrast('#9999ff', '#ffffff', 4.5);
  assert.ok(contrastRatio(dark, '#ffffff') >= 4.5, dark);
  assert.ok(luminance(dark) < luminance('#9999ff'));
  const light = ensureContrast('#333366', '#101010', 4.5);
  assert.ok(contrastRatio(light, '#101010') >= 4.5, light);
  assert.equal(ensureContrast('#000000', '#ffffff', 4.5), '#000000', 'passing colours are left alone');
});
