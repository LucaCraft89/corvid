// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHROME_WEB_STORE_UPDATE_URL, DEFAULT_EXTENSIONS, EDGE_ADDONS_UPDATE_URL,
  browserVersion, parseStoreLink, sanitizeExtensions, storeChoices, storeDownloadUrl,
} from '../src/shared/extensions.js';
import { DEFAULT_PREFS, sanitize } from '../src/shared/prefs.js';

const UBO = 'cjpalhdlnbpafiamejdnhcphjbkeiagm';

test('extension settings default to both stores on and uBlock Origin updates off', () => {
  assert.deepEqual(sanitizeExtensions(undefined), DEFAULT_EXTENSIONS);
  assert.deepEqual(DEFAULT_PREFS.extensions, DEFAULT_EXTENSIONS);
  assert.equal(DEFAULT_EXTENSIONS.ublockUpdates, false);
});

test('extension settings are sanitized', () => {
  const s = sanitizeExtensions({
    chromeWebStore: false, edgeAddons: 'yes', ublockUpdates: true,
    customStores: [
      { name: ' Mine ', updateUrl: 'https://store.example/update ' },
      { name: 'Plain http', updateUrl: 'http://store.example/update' },
      { name: '', updateUrl: 'https://x.example/' },
      { name: 'Creds', updateUrl: 'https://u:p@x.example/' },
      'junk',
    ],
  });
  assert.equal(s.chromeWebStore, false);
  assert.equal(s.edgeAddons, true);
  assert.equal(s.ublockUpdates, true);
  assert.deepEqual(s.customStores, [{ name: 'Mine', updateUrl: 'https://store.example/update' }]);
  assert.equal(sanitizeExtensions({ customStores: Array(30).fill({ name: 'a', updateUrl: 'https://a.example/' }) }).customStores.length, 20);
  // Kept through the page prefs.
  assert.equal(sanitize({ extensions: { edgeAddons: false } }).extensions.edgeAddons, false);
});

test('store links and ids are recognised', () => {
  assert.deepEqual(parseStoreLink(UBO), { id: UBO, store: null });
  assert.deepEqual(parseStoreLink(`https://chromewebstore.google.com/detail/ublock-origin/${UBO}?hl=en`), { id: UBO, store: 'chrome' });
  assert.deepEqual(parseStoreLink(`https://chrome.google.com/webstore/detail/x/${UBO}`), { id: UBO, store: 'chrome' });
  assert.deepEqual(parseStoreLink('https://microsoftedge.microsoft.com/addons/detail/ublock-origin/odfafepnkmbhccpbejgmiehpchacaeak'),
    { id: 'odfafepnkmbhccpbejgmiehpchacaeak', store: 'edge' });
  assert.deepEqual(parseStoreLink(`https://other.example/item/${UBO}`), { id: UBO, store: null });
  for (const bad of ['', 'hello', 'https://chromewebstore.google.com/', 'cjpalhdlnbpafiamejdnhcphjbkeiagz', `ftp//x/${UBO}x`]) {
    assert.equal(parseStoreLink(bad), null, bad);
  }
});

test('download address asks the store update service for one id', () => {
  const u = new URL(storeDownloadUrl(EDGE_ADDONS_UPDATE_URL, UBO, '156.0.0.0'));
  assert.equal(u.origin + u.pathname, EDGE_ADDONS_UPDATE_URL);
  assert.equal(u.searchParams.get('response'), 'redirect');
  assert.equal(u.searchParams.get('prodversion'), '156.0.0.0');
  assert.equal(u.searchParams.get('x'), `id=${UBO}&v=0.0.0.0&installsource=ondemand&uc`);
  // What the browser parses (components/corvid_extensions/sources.cc): one escaped x= value.
  assert.match(u.search, new RegExp(`x=id%3D${UBO}%26`));
  assert.equal(browserVersion('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'), '156.0.0.0');
});

test('store choices list built-in stores first', () => {
  const c = storeChoices(sanitizeExtensions({ edgeAddons: false, customStores: [{ name: 'Mine', updateUrl: 'https://s.example/u' }] }), { chrome: 'C', edge: 'E' });
  assert.deepEqual(c.map((s) => [s.key, s.enabled]), [['chrome', true], ['edge', false], ['custom-0', true]]);
  assert.equal(c[0]!.updateUrl, CHROME_WEB_STORE_UPDATE_URL);
});
