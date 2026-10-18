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
// The Corvid extensions page has no data layer in stage 1 (the stock page is used), so also read the profile: Preferences
// lists installed extensions with their manifest name and state (enabled = no disable_reasons).
function profileHasUbo() {
  try {
    const prefs = JSON.parse(readFileSync(join(profile, 'Default', 'Preferences'), 'utf8'));
    return Object.values(prefs.extensions?.settings ?? {}).some((e) => /ublock origin/i.test(e.manifest?.name ?? '') && !(e.disable_reasons > 0) && e.state !== 0);
  } catch { return false; }
}
for (let t = 0; t < 40 && !profileHasUbo(); t += 2) await sleepMs(2000); // Preferences are flushed some seconds after install
c.ok(JSON.parse(state).some((e) => /ublock origin/i.test(e.name) && e.enabled) || profileHasUbo(), `uBO present and enabled on a fresh profile (page: ${state}; profile: ${profileHasUbo()})`);
// uBO compiles its filter lists on a cold start (about 8 s on the build VM); poll instead of a single 3 s check.
async function adHitsWhenReady(b0, seconds = 60) {
  let res = await adHits(b0);
  for (let t = 0; res.adRequests.length > 0 && t < seconds; t += 5) { await sleepMs(5000); res = await adHits(b0); }
  return res;
}
let r = await adHitsWhenReady(b);
c.ok(r.control, 'control resource loaded (page works)');
c.ok(r.adRequests.length === 0, `ad/tracker requests blocked (got ${r.adRequests.length}: ${r.adRequests.map((h) => h.host).join(',')})`);
// Remove uBO through its own background page (the Corvid page has no remove hook yet): same effect as the user's Remove button.
const bg = await b.attach('chrome-extension://');
if (bg) { bg.eval(`chrome.management.uninstallSelf({ showConfirmDialog: false })`).catch(() => {}); await sleepMs(4000); } // not awaited: the page goes away with the extension
c.ok(Boolean(bg), 'uBO background page found for the removal step');
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
