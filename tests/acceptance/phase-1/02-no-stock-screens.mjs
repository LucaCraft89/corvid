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
const rendered = `(() => (document.body.firstElementChild?.shadowRoot?.textContent ?? '').trim().length > 0)()`;
const marker = `(() => document.querySelector('meta[name=corvid-page]')?.content ?? null)()`;
const unknown = extra.filter((h) => !table.pages.some((p) => p.host === h.replace(/^chrome:\/\//, '').replace(/\/$/, '')));
c.ok(unknown.length === 0, `hosts from upstream list missing in stock-pages.json: ${unknown.join(', ') || 'none'}`);

for (const url of urls) {
  await page.navigate(url, 400);
  await page.waitFor(`document.readyState !== 'loading'`, 3000);
  const m = await page.eval(marker).catch(() => null);
  const drew = await page.waitFor(rendered, 2500); // the page's own element rendered text, not just the HTML shell
  // The user-visible (virtual) URL: Corvid pages are served from chrome://corvid-<page> and shown as corvid://<page>
  // (docs/notes/corvid-scheme.md), so location.href is the internal alias; the target list holds what the omnibox shows.
  const final = (await b.targets()).find((t) => t.id === page.target.id)?.url ?? '';
  // What the document actually is (renderer view) must be the internal Corvid page, never a stock chrome:// host or an error page.
  const landed = await page.eval('location.href').catch(() => '');
  const visibleHost = /^corvid:\/\/([^/?#]+)/.exec(final)?.[1];
  const ok = !!m && /^chrome:\/\/corvid-[a-z-]+\//.test(landed) && !!visibleHost && landed.startsWith(`chrome://corvid-${visibleHost}/`) && m === visibleHost && drew;
  c.ok(ok, `${url} -> shown ${final}, landed ${landed} [marker ${m ?? 'NONE'}, rendered ${drew}]`);
}
await b.close();
c.done();
