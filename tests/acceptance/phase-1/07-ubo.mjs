#!/usr/bin/env node
// Acceptance 7: fresh profile has uBO enabled; blocks known ad/tracker requests on a local test page; can be disabled/removed
// and stays removed (also across restart). REQUIRES CORVID_BIN built WITH uBO bundled (CR-1 open: dev builds only) and
// a pinned uBO in extensions/preinstalled.toml. UNVERIFIED.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checker, launch, requireBrowser, sleepMs, skip } from './lib/cdp.mjs';
import { AD_HOSTS, startServer } from '../../fixtures/server.mjs';

const bin = requireBrowser();
const toml = readFileSync(fileURLToPath(new URL('../../../extensions/preinstalled.toml', import.meta.url)), 'utf8');
if (/^sha256\s*=\s*"TODO"/m.test(toml)) skip('uBO is not pinned in extensions/preinstalled.toml (version/sha256 are TODO)');

const c = checker('ubo');
const profile = mkdtempSync(join(tmpdir(), 'corvid-ubo-'));
const server = await startServer();
const rules = `--host-resolver-rules=MAP * 127.0.0.1:${server.port}`;

async function adHits(b) {
  server.hits.length = 0;
  const p = await b.open(`http://127.0.0.1:${server.port}/ad-test.html`);
  await sleepMs(3000);
  const adRequests = server.hits.filter((h) => AD_HOSTS.includes(h.host));
  const control = server.hits.some((h) => h.path === '/ok.js');
  p.close();
  return { adRequests, control };
}

let b = await launch({ bin, profile, extraArgs: [rules] });
const page = await b.open('corvid://extensions');
await sleepMs(1000);
const state = await page.eval(`JSON.stringify([...document.querySelector('corvid-extensions').exts ?? []].map((e) => ({ name: e.name, enabled: e.enabled })))`);
c.ok(JSON.parse(state).some((e) => /ublock origin/i.test(e.name) && e.enabled), `uBO present and enabled on a fresh profile (${state})`);
let r = await adHits(b);
c.ok(r.control, 'control resource loaded (page works)');
c.ok(r.adRequests.length === 0, `ad/tracker requests blocked (got ${r.adRequests.length}: ${r.adRequests.map((h) => h.host).join(',')})`);
await page.eval(`(async () => { const e = document.querySelector('corvid-extensions').exts.find((x) => /ublock origin/i.test(x.name)); await window.__corvidTest?.removeExtension?.(e.id); })()`).catch(() => {});
await b.close({ keepProfile: true });

b = await launch({ bin, profile, extraArgs: [rules] });
const page2 = await b.open('corvid://extensions');
await sleepMs(1000);
const after = await page2.eval(`JSON.stringify([...document.querySelector('corvid-extensions').exts ?? []].map((e) => e.name))`);
c.ok(!/ublock origin/i.test(after), `removed uBO stays removed after restart (${after})`);
r = await adHits(b);
c.ok(r.adRequests.length > 0, 'with uBO removed, ad requests are no longer blocked (control for the blocking check)');
await b.close();
await server.close();
c.done();
