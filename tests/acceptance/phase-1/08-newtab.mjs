#!/usr/bin/env node
// Acceptance 8: a new-tab-override extension loads without flash; fallback works; picker works with two extensions.
// NOT YET COVERED: precise "no flash" detection (needs Page.frameNavigated tracing to prove the Corvid page never committed
// first). This script only checks the settled page. REQUIRES CORVID_BIN. UNVERIFIED.
import { fileURLToPath } from 'node:url';
import { checker, launch, requireBrowser, sleepMs } from './lib/cdp.mjs';

const bin = requireBrowser();
const ext = (n) => fileURLToPath(new URL(`../../fixtures/ext/${n}`, import.meta.url));
const c = checker('newtab');
const marker = `document.body?.dataset.ntpOverride ?? document.querySelector('meta[name=corvid-page]')?.content ?? null`;

async function newTabKind(b, query = '') {
  const p = await b.open(`corvid://newtab${query}`);
  await sleepMs(600);
  const r = await p.eval(marker);
  p.close();
  return r;
}

// baseline: no extension
let b = await launch({ bin });
c.ok((await newTabKind(b)) === 'newtab', 'fallback: no extension -> Corvid new tab');
await b.close();

// one extension
b = await launch({ bin, extraArgs: [`--load-extension=${ext('newtab-override-a')}`] });
c.ok((await newTabKind(b)) === 'a', 'extension A overrides the new tab');
c.ok((await newTabKind(b, '?default')) === 'newtab', '?default escape hatch reaches the Corvid page');
await b.close();

// two extensions: most recently enabled wins; picker changes the winner
b = await launch({ bin, extraArgs: [`--load-extension=${ext('newtab-override-a')},${ext('newtab-override-b')}`] });
const first = await newTabKind(b);
c.ok(first === 'a' || first === 'b', `two extensions: one wins (${first})`);
const ex = await b.open('corvid://extensions');
await sleepMs(800);
const pick = first === 'a' ? 'b' : 'a';
const ok = await ex.eval(`(async () => { const s = document.querySelector('corvid-extensions'); const id = s.ntp.find((n) => n.name.endsWith(' ${pick}'))?.id; if (!id) return false; const sel = s.shadowRoot.querySelector('select'); sel.value = id; sel.dispatchEvent(new Event('change')); return true; })()`);
await sleepMs(500);
c.ok(ok && (await newTabKind(b)) === pick, `picker switches the new tab to extension ${pick}`);
await b.close();
c.done();
