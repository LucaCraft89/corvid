// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_ENGINES, DEFAULT_ENGINE_ID, isValidEngineUrl, navigationUrl, normaliseShortcutUrl,
  searchUrl, shortcutMonogram, shortcutTitle,
} from '../src/shared/search.js';

const ddg = BUILTIN_ENGINES.find((e) => e.id === DEFAULT_ENGINE_ID)!;

test('DuckDuckGo is the default and every built-in engine is valid', () => {
  assert.equal(ddg.name, 'DuckDuckGo');
  for (const e of BUILTIN_ENGINES) assert.ok(isValidEngineUrl(e.url), e.id);
  assert.equal(new Set(BUILTIN_ENGINES.map((e) => e.id)).size, BUILTIN_ENGINES.length);
});

test('search URLs encode the query', () => {
  assert.equal(searchUrl(ddg, ' a&b c '), 'https://duckduckgo.com/?q=a%26b%20c');
});

test('addresses open directly, everything else is searched', () => {
  const cases: [string, string | null][] = [
    ['', null],
    ['   ', null],
    ['example.org', 'https://example.org'],
    ['example.org/path?x=1', 'https://example.org/path?x=1'],
    ['sub.example.co.uk:8443/a', 'https://sub.example.co.uk:8443/a'],
    ['https://example.org', 'https://example.org'],
    ['http://intranet', 'http://intranet'],
    ['corvid://settings', 'corvid://settings'],
    ['about:blank', 'about:blank'],
    ['localhost:3000', 'http://localhost:3000'],
    ['192.168.1.1', 'http://192.168.1.1'],
    ['8.8.8.8', 'https://8.8.8.8'],
    ['999.1.1.1', 'https://duckduckgo.com/?q=999.1.1.1'],
    ['how to bake bread', 'https://duckduckgo.com/?q=how%20to%20bake%20bread'],
    ['corvid', 'https://duckduckgo.com/?q=corvid'],
    ['node.js tutorial', 'https://duckduckgo.com/?q=node.js%20tutorial'],
    ['3.14', 'https://duckduckgo.com/?q=3.14'],
  ];
  for (const [input, want] of cases) assert.equal(navigationUrl(input, ddg), want, input);
});

test('custom engine URLs need http(s) and %s', () => {
  assert.ok(isValidEngineUrl('https://search.example/?q=%s'));
  assert.ok(isValidEngineUrl('http://localhost:8888/search?q=%s'));
  assert.ok(!isValidEngineUrl('https://search.example/?q='));
  assert.ok(!isValidEngineUrl('javascript:alert(%s)'));
  assert.ok(!isValidEngineUrl('file:///%s'));
  assert.ok(!isValidEngineUrl('not a url %s'));
});

test('shortcut addresses', () => {
  assert.equal(normaliseShortcutUrl('example.org'), 'https://example.org/');
  assert.equal(normaliseShortcutUrl(' http://example.org/a '), 'http://example.org/a');
  assert.equal(normaliseShortcutUrl('javascript:alert(1)'), null);
  assert.equal(normaliseShortcutUrl('two words'), null);
  assert.equal(normaliseShortcutUrl(''), null);
  assert.equal(shortcutTitle({ name: '', url: 'https://www.example.org/' }), 'example.org');
  assert.equal(shortcutMonogram({ name: '', url: 'https://www.example.org/' }), 'E');
  assert.equal(shortcutMonogram({ name: 'élan', url: 'https://x.example/' }), 'É');
});
