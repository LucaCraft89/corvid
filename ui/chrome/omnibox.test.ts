import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyInput, DEFAULT_ENGINES } from './omnibox.ts';

test('classifyInput', () => {
  assert.deepEqual(classifyInput('  '), { kind: 'empty' });
  assert.deepEqual(classifyInput('https://example.com/a b'), { kind: 'url', url: 'https://example.com/a b' });
  assert.deepEqual(classifyInput('example.com/path'), { kind: 'url', url: 'https://example.com/path' });
  assert.deepEqual(classifyInput('localhost:3000'), { kind: 'url', url: 'http://localhost:3000' });
  assert.deepEqual(classifyInput('192.168.0.1'), { kind: 'url', url: 'http://192.168.0.1' });
  const s = classifyInput('how to cook rice');
  assert.equal(s.kind, 'search');
  if (s.kind === 'search') assert.equal(s.url, 'https://duckduckgo.com/?q=how%20to%20cook%20rice');
  const k = classifyInput('w corvid bird');
  assert.ok(k.kind === 'search' && k.url.startsWith('https://en.wikipedia.org/') && k.engine === 'wikipedia');
  const js = classifyInput('javascript:alert(1)');
  assert.equal(js.kind, 'search', 'javascript: is never navigated from the address bar');
  assert.equal(classifyInput('foo').kind, 'search');
});

test('default engine list has no Google/Bing default and unique ids/keywords', () => {
  assert.equal(new Set(DEFAULT_ENGINES.map((e) => e.id)).size, DEFAULT_ENGINES.length);
  assert.ok(DEFAULT_ENGINES.every((e) => e.url.includes('{query}') && e.url.startsWith('https://')));
  assert.ok(!DEFAULT_ENGINES.some((e) => /google/i.test(e.url)));
});
