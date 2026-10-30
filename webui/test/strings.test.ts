// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { en } from '../src/strings/en.js';
import { PRODUCT_NAME, placeholders, setCatalog, t } from '../src/strings/i18n.js';

// Works from test/ (tsc) and dist-test/ (bundled): both sit next to src/.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const sources = files(SRC).filter((f) => /\.(ts|html)$/.test(f) && !/(en|i18n)\.ts$/.test(f));
const code = sources.map((f) => readFileSync(f, 'utf8')).join('\n');
const keys = Object.keys(en);

// Keys built at run time from a variable, e.g. t(`error.${kind}.title`).
const DYNAMIC = [
  /^error\.(dns|offline|connection|timeout|ssl|blocked|generic)\.(title|summary|tip\d)$/,
  /^error\.ssl\.reason\.\w+$/,
  /^settings\.theme\.(mode|style|contrast)\.\w+$/,
  /^settings\.density\.(comfortable|compact|spacious)$/,
];

test('every string used in the pages exists in the catalog', () => {
  const used = new Set<string>();
  for (const m of code.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]!);
  for (const m of code.matchAll(/data-i18n(?:-[\w-]+)?="([\w.]+)"/g)) used.add(m[1]!);
  for (const m of code.matchAll(/'(settings\.theme\.preset\.\w+|newtab\.\w+|error\.\w+(?:\.\w+)*)'/g)) used.add(m[1]!);
  for (const k of used) assert.ok(k in en, `missing string: ${k}`);
});

test('every catalog string is used', () => {
  for (const k of keys) {
    const literal = code.includes(`'${k}'`) || code.includes(`"${k}"`);
    assert.ok(literal || DYNAMIC.some((re) => re.test(k)), `unused string: ${k}`);
  }
});

test('dynamic families are complete', () => {
  for (const kind of ['dns', 'offline', 'connection', 'timeout', 'ssl', 'blocked', 'generic']) {
    for (const part of ['title', 'summary', 'tip1']) assert.ok(`error.${kind}.${part}` in en, `${kind}.${part}`);
  }
});

test('the product name is never written into strings', () => {
  for (const [k, v] of Object.entries(en)) assert.doesNotMatch(v, /corvid|helium|chrom(e|ium)/i, k);
  assert.equal(t('error.dns.summary', { host: 'a.example' }).startsWith(PRODUCT_NAME + ' '), true);
});

test('sentence case: headings do not capitalise every word', () => {
  for (const [k, v] of Object.entries(en)) {
    assert.match(v, /^[^a-z]/, `${k} starts lower case`);
    if (/\.(title|pageTitle)$/.test(k)) {
      const words = v.split(' ').slice(1).filter((w) => /^[A-Za-z]/.test(w));
      assert.ok(words.every((w) => w[0] === w[0]!.toLowerCase() || w.startsWith('{')), `${k}: "${v}"`);
    }
  }
});

test('placeholders are filled and a translation must keep them', () => {
  assert.equal(t('newtab.searchPlaceholder', { engine: 'Mojeek' }), 'Search with Mojeek');
  assert.equal(t('settings.theme.aaFail', { count: 3 }).startsWith('3 '), true);
  assert.deepEqual(placeholders(en['error.ssl.summary']), ['host', 'product']);
  setCatalog({ 'common.save': 'Speichern' });
  assert.equal(t('common.save'), 'Speichern');
  assert.equal(t('common.cancel'), 'Cancel', 'missing translations fall back to English');
  setCatalog({});
});
