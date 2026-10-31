// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors
//
// Checks the pages inside the real Corvid build (phase 5): the browser must
// serve them as its own internal pages, save prefs in the profile, and show
// them where the stock pages used to be. Unlike render-check (pages on a dev
// server) this needs the patched browser.
//
//   npm run browser-check                      # every check
//   npm run browser-check -- newtab errors     # some checks
//
// Uses CORVID_BROWSER or /work/src/out/Default/corvid. Fresh profile in a temp
// folder; screenshots in render-out/browser-*.png. Exits 1 on any failure.

import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'render-out');
mkdirSync(out, { recursive: true });

const browserPath = process.env.CORVID_BROWSER ?? '/work/src/out/Default/corvid';
if (!existsSync(browserPath)) {
  console.error(`No browser at ${browserPath}. Set CORVID_BROWSER.`);
  process.exit(2);
}

const CHECKS = {};
const failures = [];
let passed = 0;
const fail = (where, msg) => failures.push(`${where}: ${msg}`);
function ok(where, cond, msg) {
  if (cond) passed++;
  else fail(where, msg);
  return cond;
}

const profiles = [];
function freshProfile() {
  const dir = mkdtempSync(join(tmpdir(), 'corvid-check-'));
  profiles.push(dir);
  return dir;
}

/** Starts the browser on a profile. Headed when DISPLAY is set. */
async function launch(profile, extraArgs = []) {
  const args = ['--no-first-run', '--no-default-browser-check', ...extraArgs];
  // Root cannot use the sandbox. The checks only load local pages.
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  return chromium.launchPersistentContext(profile, {
    executablePath: browserPath,
    headless: !process.env.DISPLAY,
    args,
    viewport: { width: 1280, height: 860 },
    ignoreDefaultArgs: ['--disable-extensions'],
  });
}

/** Opens a URL in a new tab and collects console errors for it. */
async function open(context, url, where) {
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && fail(where, `console: ${m.text()}`));
  page.on('pageerror', (e) => fail(where, `page error: ${e.message}`));
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      break;
    } catch (e) {
      // Error pages make goto throw; the page is still there to inspect.
      if (/net::ERR_(?!ABORTED)|interstitial/i.test(e.message)) break;
      if (attempt >= 3 || !/ERR_ABORTED/.test(e.message) || page.url() !== 'about:blank') throw e;
      await page.waitForTimeout(250);
    }
  }
  await page.waitForTimeout(300);
  return page;
}

async function shot(page, name) {
  await page.screenshot({ path: join(out, `browser-${name}.png`) });
}

// ---------------------------------------------------------------- new tab
CHECKS.newtab = async () => {
  const profile = freshProfile();
  let ctx = await launch(profile);
  const w = 'newtab';

  const ntp = await open(ctx, 'chrome://newtab/', w);
  ok(w, ntp.url() === 'chrome://new-tab-page/', `chrome://newtab should open chrome://new-tab-page/, got ${ntp.url()}`);
  const info = await ntp.evaluate(() => ({
    ours: !!document.querySelector('#tiles') && !!document.querySelector('#search'),
    stock: !!document.querySelector('ntp-app'),
    title: document.title,
    init: window.corvidInit ?? null,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  ok(w, info.ours && !info.stock, 'new tab is not the Corvid page');
  ok(w, info.title === 'New tab', `title "${info.title}"`);
  ok(w, !!info.init && typeof info.init.prefs === 'object' && info.init.readOnly === false, `corvid-init.js missing or wrong: ${JSON.stringify(info.init)}`);
  console.log(`  new tab: accent from browser = ${JSON.stringify(info.init?.accent)}`);
  await shot(ntp, 'newtab');

  // A second new tab hears about changes made in the first.
  const other = await open(ctx, 'chrome://new-tab-page/', w);
  await ntp.click('.tile-add');
  await ntp.fill('#sc-url', 'example.org');
  await ntp.fill('#sc-name', 'Example');
  await ntp.click('#shortcut-form button[type=submit]');
  await ntp.waitForTimeout(500);
  const tiles = await other.$$eval('#tiles .tile-name', (els) => els.map((e) => e.textContent));
  ok(w, tiles.includes('Example'), `other new tab did not update live: ${JSON.stringify(tiles)}`);
  await ctx.close();

  // Saved in the profile: still there after a restart.
  ctx = await launch(profile);
  const again = await open(ctx, 'chrome://newtab/', w);
  const after = await again.$$eval('#tiles a', (els) => els.map((e) => e.getAttribute('href')));
  ok(w, after.includes('https://example.org/'), `shortcut not kept after restart: ${JSON.stringify(after)}`);
  await ctx.close();
};

// ---------------------------------------------------------------- settings
const primary = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim());

CHECKS.settings = async () => {
  const w = 'settings';
  const ctx = await launch(freshProfile());
  const ntp = await open(ctx, 'chrome://newtab/', w);
  const before = await primary(ntp);

  const s = await open(ctx, 'chrome://preferences/', w);
  const info = await s.evaluate(() => ({
    ours: !!document.querySelector('#swatches'),
    title: document.title,
    systemChecked: document.querySelector('#swatches input[value=system]')?.checked ?? null,
  }));
  ok(w, info.ours, 'chrome://preferences is not the Corvid settings page');
  ok(w, info.systemChecked === true, `desktop accent swatch should be the default, got ${info.systemChecked}`);
  await shot(s, 'settings');

  // A change in settings reaches the open new tab and the profile.
  await s.click('#swatches label[title="Teal"]');
  await s.click('#mode label:has-text("Dark")');
  await ntp.waitForTimeout(500);
  const after = await primary(ntp);
  ok(w, after !== before, `new tab colour did not follow settings (${before} -> ${after})`);
  ok(w, (await ntp.evaluate(() => document.documentElement.dataset.themeMode)) === 'dark', 'new tab did not switch to dark');
  await shot(ntp, 'newtab-teal-dark');
  const reloaded = await open(ctx, 'chrome://newtab/', w);
  ok(w, (await reloaded.evaluate(() => window.corvidInit?.prefs?.seedSource)) === 'custom', 'prefs not saved in the profile');

  // The stock settings page links to ours.
  const stock = await open(ctx, 'chrome://settings/appearance', w);
  await stock.waitForTimeout(800);
  const row = stock.locator('#corvidPages');
  ok(w, (await row.count()) === 1, 'no entry in Settings > Appearance');
  if (await row.count()) {
    await shot(stock, 'stock-appearance');
    const [opened] = await Promise.all([ctx.waitForEvent('page'), row.click()]);
    await opened.waitForLoadState('load');
    ok(w, opened.url() === 'chrome://preferences/', `entry opened ${opened.url()}`);
  }
  await ctx.close();
};

// ---------------------------------------------------------------- error pages
/** Local HTTPS server with a self-signed certificate. */
async function startServers() {
  const dir = freshProfile();
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=selfsigned.test',
    '-addext', 'subjectAltName=DNS:selfsigned.test', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
  const hello = (req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>hello</title><p id="hello">hello</p>'); };
  const tls = https.createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, hello);
  await new Promise((r) => tls.listen(0, '127.0.0.1', r));
  return { tlsPort: tls.address().port, close: () => tls.close() };
}

async function errorView(page) {
  return page.evaluate(() => ({
    ours: !!document.querySelector('#err'),
    stock: !!document.querySelector('#main-frame-error, #main-content .interstitial-wrapper, .interstitial-wrapper'),
    kind: document.querySelector('#err')?.dataset.kind ?? null,
    title: document.querySelector('#err-title')?.textContent ?? '',
    code: window.corvidErrorInfo?.code ?? null,
    chain: window.corvidErrorInfo?.certChain?.length ?? 0,
    buttons: [...document.querySelectorAll('#err-actions button')].map((b) => b.textContent),
    proceedHidden: document.querySelector('#err-proceed')?.hidden ?? null,
  }));
}

CHECKS.errors = async () => {
  const w = 'errors';
  const srv = await startServers();
  const ctx = await launch(freshProfile(), ['--host-resolver-rules=MAP selfsigned.test 127.0.0.1']);
  try {
    const dns = await open(ctx, 'http://does-not-exist.invalid/', w);
    let v = await errorView(dns);
    ok(w, v.ours && !v.stock && v.kind === 'dns', `unknown host: ${JSON.stringify(v)}`);
    await shot(dns, 'error-dns');
    // "Try again" goes through Chromium's error page controller.
    await dns.click('#err-actions button');
    await dns.waitForTimeout(1500);
    v = await errorView(dns);
    ok(w, v.ours && v.kind === 'dns', `after "Try again": ${JSON.stringify(v)}`);

    const refused = await open(ctx, 'http://127.0.0.1:59999/', w);
    v = await errorView(refused);
    ok(w, v.ours && v.kind === 'connection' && v.code === 'ERR_CONNECTION_REFUSED', `refused: ${JSON.stringify(v)}`);

    const ssl = await open(ctx, `https://selfsigned.test:${srv.tlsPort}/`, w);
    v = await errorView(ssl);
    ok(w, v.ours && !v.stock && v.kind === 'ssl' && /^ERR_CERT_/.test(v.code), `self-signed: ${JSON.stringify(v)}`);
    ok(w, v.chain >= 1, 'certificate chain missing from the details');
    ok(w, v.proceedHidden === false, '"continue" should be offered (inside the details) for an overridable error');
    await ssl.click('#err-details summary');
    await shot(ssl, 'error-ssl');
    await ssl.click('#proceed');
    await ssl.waitForSelector('#hello', { timeout: 10000 }).catch(() => {});
    ok(w, await ssl.$('#hello') !== null, `"continue" did not load the site (${ssl.url()})`);

  } finally {
    await ctx.close();
    srv.close();
  }
};

// ---------------------------------------------------------------- private window
CHECKS.private = async () => {
  const w = 'private';
  const browser = await chromium.launch({
    executablePath: browserPath, headless: !process.env.DISPLAY,
    args: ['--no-first-run', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
  });
  // A Playwright context is an off-the-record profile.
  const ctx = await browser.newContext();
  const p = await open(ctx, 'chrome://newtab/', w);
  const info = await p.evaluate(() => ({ ours: !!document.querySelector('#tiles'), init: window.corvidInit ?? null }));
  ok(w, p.url() === 'chrome://newtab/', `private new tab URL ${p.url()}`);
  ok(w, info.ours, 'private new tab is not the Corvid page');
  ok(w, info.init?.readOnly === true, 'private new tab is not read-only');
  await shot(p, 'private-newtab');
  await browser.close();
};

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const run = wanted.length ? wanted : Object.keys(CHECKS);
console.log(`browser: ${browserPath}`);
for (const name of run) {
  if (!CHECKS[name]) {
    fail(name, 'no such check');
    continue;
  }
  console.log(`== ${name}`);
  try {
    await CHECKS[name]();
  } catch (e) {
    fail(name, `threw: ${e.stack ?? e}`);
  }
}
for (const d of profiles) rmSync(d, { recursive: true, force: true });
console.log(`\n${passed} checks passed, ${failures.length} failed`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
