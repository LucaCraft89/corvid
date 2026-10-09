import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SOURCES, MANUAL_INSTALL_METHODS, addSource, removeSource, setSourceEnabled, sourceHosts, validateSource } from './sources.ts';

test('defaults: Chrome Web Store and Edge Add-ons, all removable, manual methods listed', () => {
  assert.deepEqual(DEFAULT_SOURCES.map((s) => s.id), ['chrome-web-store', 'edge-addons']);
  assert.deepEqual([...MANUAL_INSTALL_METHODS], ['crx-file', 'zip-file', 'unpacked-directory']);
  assert.deepEqual(removeSource(removeSource(DEFAULT_SOURCES, 'chrome-web-store'), 'edge-addons'), [], 'defaults can be removed');
});

test('validateSource: https only (localhost may use http), no credentials, unique', () => {
  const ok = validateSource({ name: 'My Store', updateUrl: 'https://store.example/update', storeUrl: 'https://store.example/' }, DEFAULT_SOURCES);
  assert.ok(ok.ok && ok.source.id === 'my-store' && ok.source.origin === 'user');
  assert.equal(validateSource({ name: 'x', updateUrl: 'http://store.example/u', storeUrl: 'https://s.example' }, []).ok, false);
  assert.equal(validateSource({ name: 'x', updateUrl: 'http://localhost:8080/u', storeUrl: 'http://127.0.0.1/' }, []).ok, true);
  assert.equal(validateSource({ name: 'x', updateUrl: 'https://u:p@s.example/', storeUrl: 'https://s.example' }, []).ok, false);
  assert.equal(validateSource({ name: '', updateUrl: 'https://s.example/', storeUrl: 'https://s.example' }, []).ok, false);
  assert.equal(validateSource({ name: 'dup', updateUrl: DEFAULT_SOURCES[0]!.updateUrl, storeUrl: 'https://s.example' }, DEFAULT_SOURCES).ok, false);
  assert.equal(validateSource({ name: 'x', updateUrl: 'not a url', storeUrl: 'https://s.example' }, []).ok, false);
});

test('add / disable / hosts', () => {
  const v = validateSource({ name: 'Edge Add-ons', updateUrl: 'https://other.example/u', storeUrl: 'https://other.example' }, DEFAULT_SOURCES);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.source.id, 'edge-add-ons');
  const list = addSource(DEFAULT_SOURCES, v.source);
  assert.equal(list.length, 3);
  assert.deepEqual(sourceHosts(setSourceEnabled(list, 'chrome-web-store', false)), ['edge.microsoft.com', 'other.example']);
});
