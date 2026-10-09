#!/usr/bin/env node
// Acceptance 2: every known chrome:// URL ends on a Corvid page (meta corvid-page marker): replaced, redirected, or blocked.
// URL list = ui/pages/stock-pages.json hosts + subpaths + chrome-urls.extra.txt (hosts dumped from an UNMODIFIED
// upstream build's chrome://chrome-urls, to catch hosts the table does not know). REQUIRES CORVID_BIN. UNVERIFIED.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checker, launch, requireBrowser } from './lib/cdp.mjs';

const bin = requireBrowser();
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const table = JSON.parse(readFileSync(here('../../../ui/pages/stock-pages.json'), 'utf8'));
const extraFile = here('./chrome-urls.extra.txt');
const extra = existsSync(extraFile) ? readFileSync(extraFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
const subpaths = ['settings/syncSetup', 'settings/passwords', 'settings/people', 'settings/search', 'settings/content', 'extensions/shortcuts', 'history/syncedTabs', 'newtab/?x'];
const urls = [...new Set([...table.pages.map((p) => `chrome://${p.host}/`), ...extra.map((h) => `chrome://${h.replace(/^chrome:\/\//, '').replace(/\/$/, '')}/`), ...subpaths.map((s) => `chrome://${s}`)])];

const c = checker('no-stock-screens');
const b = await launch({ bin });
const page = await b.open('about:blank');
const marker = `(() => document.querySelector('meta[name=corvid-page]')?.content ?? null)()`;
const unknown = extra.filter((h) => !table.pages.some((p) => p.host === h.replace(/^chrome:\/\//, '').replace(/\/$/, '')));
c.ok(unknown.length === 0, `hosts from upstream list missing in stock-pages.json: ${unknown.join(', ') || 'none'}`);

for (const url of urls) {
  await page.navigate(url, 400);
  await page.waitFor(`document.readyState !== 'loading'`, 3000);
  const m = await page.eval(marker).catch(() => null);
  const final = await page.eval('location.href').catch(() => '');
  const ok = !!m && /^corvid:\/\//.test(final);
  c.ok(ok, `${url} -> ${final} [${m ?? 'NO CORVID MARKER'}]`);
}
await b.close();
c.done();
