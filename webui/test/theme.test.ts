// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeCss, themeIssueCount } from '../src/shared/theme.js';
import { DEFAULT_PREFS } from '../src/shared/prefs.js';

test('automatic mode switches with the system, fixed modes do not', () => {
  const auto = themeCss(DEFAULT_PREFS);
  assert.match(auto.css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(auto.css, /color-scheme: light dark/);
  const dark = themeCss({ ...DEFAULT_PREFS, themeMode: 'dark' });
  assert.doesNotMatch(dark.css, /@media/);
  assert.ok(dark.css.includes(`--md-sys-color-surface: ${dark.dark.surface};`));
  const light = themeCss({ ...DEFAULT_PREFS, themeMode: 'light' });
  assert.ok(light.css.includes(`--md-sys-color-surface: ${light.light.surface};`));
});

test('default theme passes WCAG AA in both modes', () => {
  assert.equal(themeIssueCount(themeCss(DEFAULT_PREFS)), 0);
});
