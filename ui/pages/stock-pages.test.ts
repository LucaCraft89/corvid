import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = fileURLToPath(new URL('./', import.meta.url));
const data = JSON.parse(readFileSync(dir + 'stock-pages.json', 'utf8')) as { pages: Array<{ host: string; action: string; target: string }> };

test('stock page table: unique hosts, valid actions, targets exist as Corvid pages', () => {
  const hosts = data.pages.map((p) => p.host);
  assert.equal(new Set(hosts).size, hosts.length, 'duplicate hosts');
  for (const p of data.pages) {
    assert.ok(['replaced', 'redirected', 'blocked'].includes(p.action), p.host);
    assert.ok(existsSync(`${dir}${p.target}/index.html`), `${p.host} -> missing page ${p.target}`);
  }
  for (const must of ['settings', 'newtab', 'history', 'downloads', 'extensions', 'bookmarks', 'flags', 'net-internals', 'gpu', 'version']) assert.ok(hosts.includes(must), must);
});

test('generated docs and C++ table are up to date', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../tools/gen-stock-pages.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
