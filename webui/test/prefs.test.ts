// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, STORAGE_KEY, createLocalStore, currentEngine, sanitize, type KeyValueStorage, type Prefs } from '../src/shared/prefs.js';

function fakeStorage(init: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

test('sanitize turns junk into defaults', () => {
  for (const junk of [null, undefined, 42, 'x', [], { themeMode: 'purple', seed: 'nope', density: 3, shortcuts: 'a' }]) {
    assert.deepEqual(sanitize(junk), { ...DEFAULT_PREFS });
  }
});

test('sanitize keeps valid values and drops bad entries', () => {
  const p = sanitize({
    themeMode: 'dark', seed: '#123456', contrast: 'high', style: 'expressive', density: 'compact',
    customEngines: [
      { id: 'c1', name: 'Mine', url: 'https://s.example/?q=%s' },
      { id: 'c2', name: 'Bad', url: 'javascript:%s' },
      { id: 'c3', name: '  ', url: 'https://s.example/?q=%s' },
    ],
    searchEngine: 'c1',
    shortcuts: [{ name: 'A', url: 'example.org' }, { name: 'B', url: 'javascript:alert(1)' }, { url: 5 }],
  });
  assert.equal(p.themeMode, 'dark');
  assert.equal(p.contrast, 'high');
  assert.equal(p.style, 'expressive');
  assert.equal(p.density, 'compact');
  assert.deepEqual(p.customEngines.map((e) => e.id), ['c1']);
  assert.equal(p.searchEngine, 'c1');
  assert.equal(currentEngine(p).name, 'Mine');
  assert.deepEqual(p.shortcuts, [{ name: 'A', url: 'https://example.org/' }]);
});

test('an engine that no longer exists falls back to the default', () => {
  assert.equal(sanitize({ searchEngine: 'gone' }).searchEngine, DEFAULT_PREFS.searchEngine);
});

test('store saves, reloads, notifies and resets', () => {
  const storage = fakeStorage();
  const store = createLocalStore(storage);
  const seen: Prefs[] = [];
  store.subscribe((p) => seen.push(p));
  store.set({ themeMode: 'dark', shortcuts: [{ name: 'X', url: 'https://x.example/' }] });
  assert.equal(seen.length, 1);
  assert.equal(createLocalStore(storage).get().themeMode, 'dark');
  store.reset();
  assert.equal(store.get().themeMode, 'auto');
  assert.equal(store.get().shortcuts.length, 1, 'reset keeps shortcuts');
});

test('corrupt storage gives defaults, full storage keeps working', () => {
  const store = createLocalStore(fakeStorage({ [STORAGE_KEY]: '{not json' }));
  assert.deepEqual(store.get(), { ...DEFAULT_PREFS });
  const full: KeyValueStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  const s2 = createLocalStore(full);
  assert.equal(s2.set({ density: 'spacious' }).density, 'spacious');
});

test('changes from another page reach subscribers', () => {
  const storage = fakeStorage();
  const listeners: ((e: { key: string | null }) => void)[] = [];
  const win = { addEventListener: (_: string, fn: (e: { key: string | null }) => void) => listeners.push(fn) };
  const store = createLocalStore(storage, win as never);
  let got: Prefs | undefined;
  store.subscribe((p) => (got = p));
  createLocalStore(storage).set({ density: 'compact' }); // "the other page"
  listeners.forEach((fn) => fn({ key: STORAGE_KEY }));
  assert.equal(got?.density, 'compact');
});
