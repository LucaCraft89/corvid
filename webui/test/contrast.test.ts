// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, isHexColor, luminance, meetsAA, parseHex } from '../src/color/contrast.js';

test('parseHex accepts #rgb and #rrggbb, rejects junk', () => {
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]);
  assert.deepEqual(parseHex('5B6BC0'), [0x5b, 0x6b, 0xc0]);
  for (const bad of ['', '#ffff', 'red', '#12345g', '#1234567']) assert.equal(isHexColor(bad), false, bad);
});

test('known contrast ratios', () => {
  assert.equal(contrastRatio('#000', '#fff'), 21);
  assert.equal(contrastRatio('#fff', '#000'), 21);
  assert.equal(contrastRatio('#5b6bc0', '#5b6bc0'), 1);
  assert.equal(luminance('#000000'), 0);
  assert.equal(luminance('#ffffff'), 1);
  // #767676 on white is the classic lightest AA grey (4.54); #777777 just fails (4.48).
  assert.ok(meetsAA('#767676', '#ffffff'));
  assert.ok(!meetsAA('#777777', '#ffffff'));
  assert.ok(meetsAA('#777777', '#ffffff', 'large-text'));
});
