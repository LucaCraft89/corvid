// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DENSITIES, springs, springToCss, tokensCss, typeScale } from '../src/tokens/tokens.js';

function points(easing: string): number[] {
  return easing.replace(/^linear\(|\)$/g, '').split(',').map(Number);
}

test('springs start at 0 and end at 1', () => {
  for (const [name, [d, s]] of Object.entries(springs)) {
    const { easing, duration } = springToCss(d, s);
    const p = points(easing);
    assert.equal(p[0], 0, name);
    assert.equal(p.at(-1), 1, name);
    assert.ok(duration > 50 && duration < 1500, `${name} ${duration}ms`);
  }
});

test('under-damped springs overshoot, critically damped ones do not', () => {
  assert.ok(Math.max(...points(springToCss(0.6, 800).easing)) > 1.05);
  assert.ok(Math.max(...points(springToCss(1, 1600).easing)) <= 1);
});

test('stiffer springs are faster', () => {
  assert.ok(springToCss(...springs.spatialFast).duration < springToCss(...springs.spatialSlow).duration);
  assert.ok(springToCss(...springs.effectsFast).duration < springToCss(...springs.effectsSlow).duration);
});

test('token CSS has shapes, type scale, motion and densities', () => {
  const css = tokensCss();
  assert.match(css, /--md-sys-shape-corner-extra-large-increased: 32px;/);
  assert.match(css, /--md-sys-motion-spring-spatial-default: linear\(/);
  for (const k of Object.keys(typeScale)) {
    const n = k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
    assert.ok(css.includes(`--md-sys-typescale-${n}-size:`), k);
  }
  for (const d of DENSITIES) assert.ok(css.includes(`[data-density="${d}"]`), d);
});
