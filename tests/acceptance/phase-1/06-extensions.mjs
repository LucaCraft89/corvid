#!/usr/bin/env node
// Acceptance 6: MV2 (blocking webRequest, persistent background) and MV3 test extensions both work and survive restart;
// no deprecation warnings. REQUIRES CORVID_BIN. UNVERIFIED. (--load-extension may be restricted in some builds; if so the
// harness needs a dev flag from patches/extensions/.)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checker, launch, requireBrowser, sleepMs } from './lib/cdp.mjs';
import { startServer } from '../../fixtures/server.mjs';

const bin = requireBrowser();
const ext = (n) => fileURLToPath(new URL(`../../fixtures/ext/${n}`, import.meta.url));
const c = checker('extensions');
const profile = mkdtempSync(join(tmpdir(), 'corvid-ext-'));
const server = await startServer();
const load = `--load-extension=${ext('mv2-blocking-webrequest')},${ext('mv3-basic')}`;

async function round(label) {
  const b = await launch({ bin, profile, extraArgs: [load] });
  const p = await b.open(`http://127.0.0.1:${server.port}/ext-test.html`);
  await sleepMs(1500);
  server.hits.length = 0;
  await p.navigate(`http://127.0.0.1:${server.port}/ext-test.html`, 1500);
  const loaded = await p.eval('JSON.stringify(window.__loaded || [])');
  const dataset = await p.eval('JSON.stringify({ mv2: document.documentElement.dataset.corvidMv2, mv3: document.documentElement.dataset.corvidMv3 })');
  c.ok(!loaded.includes('mv2-blocked'), `${label}: MV2 blocking webRequest blocked its target (loaded=${loaded})`);
  c.ok(!loaded.includes('mv3-blocked'), `${label}: MV3 declarativeNetRequest blocked its target`);
  c.ok(loaded.includes('/ok.js'), `${label}: control resource still loads`);
  c.ok(dataset.includes('"mv2":"1"') && dataset.includes('"mv3":"1"'), `${label}: content scripts ran (${dataset})`);
  const ex = await b.open('corvid://extensions');
  await sleepMs(800);
  const text = await ex.eval('document.querySelector("corvid-extensions")?.shadowRoot?.textContent ?? ""');
  c.ok(!/deprecat|no longer supported|will be removed|disabled because/i.test(text), `${label}: no MV2 deprecation text on corvid://extensions`);
  await b.close({ keepProfile: true });
}
await round('first run');
await round('after restart');
await server.close();
c.done();
