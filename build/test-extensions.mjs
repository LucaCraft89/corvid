// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors
//
// Extension compatibility test (run through build/test-extensions.sh).
// For each extension in the list: a fresh profile, install it the way a user
// would (store link in chrome://preferences, or the Chrome Web Store page),
// click the real install prompt, then check that it is installed and enabled,
// that its background starts, that its popup or options page loads, and one
// check for its category (ad blocking, new tab, dark mode, link cleaning).
// Writes a JSON result file and the Markdown table in docs/extension-compat.md.

import { createRequire } from 'node:module';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = new URL('..', import.meta.url).pathname;
const require = createRequire(join(repo, 'webui/package.json'));
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const browserPath = opt('--binary', '/work/src/out/Default/corvid');
const work = opt('--work', '/work/tmp/extcompat');
const outMd = opt('--out', join(repo, 'docs/extension-compat.md'));
const only = opt('--only', '')?.split(',').filter(Boolean) ?? [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [name, store, id, category, how it is installed]
const EXTENSIONS = [
  ['uBlock Origin Lite', 'chrome', 'ddkjiahejlhfcafbddmgiahcphecmpfh', 'adblock', 'store-page'],
  ['AdGuard AdBlocker', 'chrome', 'bgnkhhnnamicmpeenaelnjfhikgbkllg', 'adblock'],
  ['Adblock Plus', 'chrome', 'cfhdojbkjhnklbpkdaibdccddilifddb', 'adblock'],
  ['Ghostery', 'chrome', 'mlomiejdfkolichcflejclcbmpeaniij', 'adblock'],
  ['Privacy Badger', 'chrome', 'pkehgijcmpdhfbdbbnkijodmdjhbjlgp', 'privacy'],
  ['ClearURLs', 'edge', 'mdkdmaickkfdekbjdoojfalpbkgaddei', 'clearurls'],
  ['Bitwarden', 'chrome', 'nngceckbapebfimnlniiiahkandclblb', 'password'],
  ['1Password', 'chrome', 'aeblfdkhhhdcdjpifhhbdiojplfjncoa', 'password'],
  ['KeePassXC-Browser', 'chrome', 'oboonakemofpalcgghocfoadofidjkkk', 'password'],
  ['Proton Pass', 'chrome', 'ghmbeldphafepmbegfdlkpapadhbakde', 'password'],
  ['Momentum', 'chrome', 'laookkfknpbbblfpciffpaejjkokdgca', 'newtab'],
  ['Tabliss', 'chrome', 'hipekcciheckooncpjeljhnekcoolahp', 'newtab'],
  ['Dark Reader', 'chrome', 'eimadpbcbfnmbkopoojfekhnkhdbieeh', 'darkmode'],
  ['SponsorBlock', 'chrome', 'mnjggcdmjocbbbhaepdhchncahnbgone', 'other'],
  ['Return YouTube Dislike', 'chrome', 'gebbhagfogifgggkldgodflihgfeippi', 'other'],
  ['Grammarly', 'chrome', 'kbfnbcaeplbcioakkpcpgfkobkghlhen', 'other'],
  ['Tampermonkey', 'chrome', 'dhdgffkkebhmkfjojejmpbldmpobfkfo', 'userscripts'],
  ['Violentmonkey', 'chrome', 'jinjaccalgkegednnccohejagnlnfdag', 'userscripts'],
  ['React Developer Tools', 'chrome', 'fmkadmapgofadopljbjfkapdkoienihi', 'devtools'],
  ['JSON Formatter', 'chrome', 'bcjindcccaagfpapjjmafapmmgkkhgoa', 'other'],
];
const UBO = 'fkgkibajhfbepljeaefdnfnegdcjomkh';  // preinstalled uBlock Origin
const MUST_PASS = ['adblock', 'password', 'newtab'];

// Local test site, reached through --host-resolver-rules: an ad script on an
// ad host, an ad box, a white page for dark mode, tracking parameters.
const PORT = 8099;
const served = [];
const site = http.createServer((q, r) => {
  served.push(`${q.headers.host}${q.url}`);
  if (q.url.endsWith('adsbygoogle.js')) { r.setHeader('content-type', 'text/javascript'); return r.end('window.adLoaded = true;'); }
  r.setHeader('content-type', 'text/html');
  r.end(`<!doctype html><title>test page</title><body style="background:#fff;color:#000">
<div class="adsbygoogle-box" id="adbox">ad box</div><p>Plain test page.</p>
<script src="http://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script></body>`);
}).listen(PORT, '127.0.0.1');
const RULES = `MAP pagead2.googlesyndication.com 127.0.0.1:${PORT}, MAP site.test 127.0.0.1:${PORT}`;

mkdirSync(work, { recursive: true });
const shotPath = join(work, 'screen.png');

/** Finds and clicks the confirm button of the native install prompt. */
async function confirmPrompt(seconds = 30) {
  for (let i = 0; i < seconds; i++) {
    execFileSync('import', ['-window', 'root', shotPath]);
    const xy = execFileSync('python3', ['-I', join(repo, 'build/lib/find-install-button.py'), shotPath]).toString().trim();
    if (xy) {
      const [x, y] = xy.split(' ');
      execFileSync('xdotool', ['mousemove', x, y, 'click', '1']);
      return true;
    }
    await sleep(1000);
  }
  return false;
}

async function launch(profile) {
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: browserPath, headless: false, viewport: null,
    // Keep what a user has: extensions, the updater, preinstalled extensions.
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages',
      '--disable-background-networking', '--disable-default-apps', '--disable-component-update'],
    args: ['--no-first-run', '--no-default-browser-check', '--window-position=0,0', '--window-size=1280,900',
      `--host-resolver-rules=${RULES}`,
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
  });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  // Playwright saves downloads itself; let the browser open them (a .crx opens the install prompt).
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });
  return { ctx, page, cdp };
}

async function extensionsPage(ctx, fn, arg) {
  const p = await ctx.newPage();
  await p.goto('chrome://extensions');
  await sleep(1200);
  const r = await p.evaluate(fn, arg);
  await p.close();
  return r;
}

const listExtensions = (ctx) => extensionsPage(ctx, () =>
  [...document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-item-list').shadowRoot.querySelectorAll('extensions-item')]
    .map((i) => ({ id: i.id, name: i.shadowRoot.querySelector('#name').textContent.trim(), enabled: !!i.shadowRoot.querySelector('#enableToggle')?.checked })));

const setEnabled = (ctx, id, on) => extensionsPage(ctx, ([i, o]) => chrome.management.setEnabled(i, o).then(() => 'ok', (e) => String(e)), [id, on]);

function manifestOf(profile, id) {
  const dir = join(profile, 'Default/Extensions', id);
  if (!existsSync(dir)) return null;
  const ver = readdirSync(dir).sort().pop();
  try { return JSON.parse(readFileSync(join(dir, ver, 'manifest.json'), 'utf8')); } catch { return null; }
}

async function installFromStorePage(page, id) {
  await page.goto(`https://chromewebstore.google.com/detail/${id}`, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  if (page.url().includes('consent.google')) {
    await page.getByRole('button', { name: /Reject all/ }).first().click();
    await sleep(5000);
  }
  await page.locator('main button', { hasText: /^Add to / }).first().click({ timeout: 15000 });
  return confirmPrompt();
}

async function installFromPreferences(page, store, id) {
  await page.goto('chrome://preferences/#extensions');
  await sleep(1200);
  await page.fill('#install-link', id);
  await page.selectOption('#install-store', store);
  await page.click('#install-form button[type=submit]');
  return confirmPrompt();
}

/** Background service worker or page of the extension, from the browser's target list. */
async function backgroundRunning(cdp, id) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  return targetInfos.some((t) => t.url.startsWith(`chrome-extension://${id}/`) && ['service_worker', 'background_page'].includes(t.type));
}

async function uiPage(ctx, id, manifest) {
  const path = manifest.action?.default_popup ?? manifest.browser_action?.default_popup ??
    manifest.options_ui?.page ?? manifest.options_page;
  if (!path) return { result: 'n/a', note: 'no popup or options page' };
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  try {
    await p.goto(`chrome-extension://${id}/${path.replace(/^\//, '')}`, { timeout: 15000 });
    await sleep(2500);
    const elements = await p.evaluate(() => document.body ? document.body.querySelectorAll('*').length : 0);
    return { result: elements > 3 && errors.length === 0 ? 'pass' : 'fail', note: `${path}: ${elements} elements${errors.length ? `, error: ${errors[0]}` : ''}` };
  } catch (e) {
    return { result: 'fail', note: `${path}: ${String(e.message).split('\n')[0]}` };
  } finally {
    await p.close();
  }
}

async function categoryCheck(run, category, id) {
  const { ctx } = run;
  if (category === 'adblock') {
    const p = await ctx.newPage();
    await p.goto('http://site.test/');
    await sleep(2500);
    const r = await p.evaluate(() => ({ script: window.adLoaded ? 'loaded' : 'blocked', box: getComputedStyle(document.getElementById('adbox')).display === 'none' ? 'hidden' : 'shown' }));
    await p.close();
    return { result: r.script === 'blocked' ? 'pass' : 'fail', note: `ad script ${r.script}, ad box ${r.box}` };
  }
  if (category === 'newtab') {
    const p = await ctx.newPage();
    await p.goto('chrome://newtab').catch(() => {});
    await sleep(3000);
    const url = p.url();
    await p.close();
    return { result: url.startsWith(`chrome-extension://${id}/`) ? 'pass' : 'fail', note: `new tab shows ${url.split('?')[0]}` };
  }
  if (category === 'darkmode') {
    const p = await ctx.newPage();
    await p.goto('http://site.test/');
    await sleep(3500);
    const bg = await p.evaluate(() => {
      const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
      const filter = getComputedStyle(document.documentElement).filter;
      return { c, filter };
    });
    await p.close();
    const dark = bg.c.slice(0, 3).reduce((a, b) => a + b, 0) < 300 || bg.filter.includes('invert');
    return { result: dark ? 'pass' : 'fail', note: `page background rgb(${bg.c.slice(0, 3).join(',')})${bg.filter !== 'none' ? ` filter ${bg.filter}` : ''}` };
  }
  if (category === 'clearurls') {
    const p = await ctx.newPage();
    await p.goto('http://site.test/page?utm_source=test&utm_medium=x&id=1').catch(() => {});
    await sleep(2000);
    const url = p.url();
    await p.close();
    return { result: !url.includes('utm_') ? 'pass' : 'fail', note: `address after load ${url}` };
  }
  return { result: 'n/a', note: '' };
}

async function testOne([name, store, id, category, how]) {
  const profile = mkdtempSync(join(work, 'profile-'));
  const row = { name, store, id, category, how: how ?? 'preferences', install: 'fail', enabled: false, mv: null, version: null, background: 'n/a', ui: { result: 'n/a', note: '' }, check: { result: 'n/a', note: '' }, notes: [] };
  let run;
  try {
    run = await launch(profile);
    await sleep(4000);
    if (category === 'adblock') {
      // The preinstalled uBlock Origin would block the test ads by itself.
      row.notes.push(`preinstalled uBlock Origin off: ${await setEnabled(run.ctx, UBO, false)}`);
    }
    const prompted = row.how === 'store-page' ? await installFromStorePage(run.page, id) : await installFromPreferences(run.page, store, id);
    if (!prompted) row.notes.push('no install prompt seen');
    let ext;
    for (let i = 0; i < 20 && !ext; i++) {
      await sleep(1000);
      ext = (await listExtensions(run.ctx)).find((e) => e.id === id);
    }
    if (!ext) throw new Error('not installed');
    row.install = 'pass';
    row.enabled = ext.enabled;
    const manifest = manifestOf(profile, id);
    row.mv = manifest?.manifest_version ?? null;
    row.version = manifest?.version ?? null;
    await sleep(3000);
    if (manifest?.background) row.background = (await backgroundRunning(run.cdp, id)) ? 'pass' : 'fail';
    if (manifest) row.ui = await uiPage(run.ctx, id, manifest);
    row.check = await categoryCheck(run, category, id);
  } catch (e) {
    row.notes.push(String(e.message ?? e).split('\n')[0].slice(0, 160));
  } finally {
    if (run) await Promise.race([run.ctx.close(), sleep(15000)]);
    rmSync(profile, { recursive: true, force: true });
  }
  row.pass = row.install === 'pass' && row.enabled && row.background !== 'fail' && row.ui.result !== 'fail' && row.check.result !== 'fail';
  return row;
}

/** The preinstalled uBlock Origin on a fresh profile. */
async function testPreinstalled() {
  const profile = mkdtempSync(join(work, 'profile-'));
  const row = { name: 'uBlock Origin (preinstalled)', store: 'bundled', id: UBO, category: 'adblock', how: 'preinstalled', install: 'fail', enabled: false, mv: null, version: null, background: 'n/a', ui: { result: 'n/a', note: '' }, check: { result: 'n/a', note: '' }, notes: [] };
  let run;
  try {
    run = await launch(profile);
    await sleep(15000);  // installed from <install dir>/extensions, restarts itself once
    const ext = (await listExtensions(run.ctx)).find((e) => e.id === UBO);
    if (!ext) throw new Error('not installed');
    row.install = 'pass';
    row.enabled = ext.enabled;
    const manifest = manifestOf(profile, UBO);
    row.mv = manifest?.manifest_version ?? null;
    row.version = manifest?.version ?? null;
    row.background = (await backgroundRunning(run.cdp, UBO)) ? 'pass' : 'fail';
    if (manifest) row.ui = await uiPage(run.ctx, UBO, manifest);
    row.check = await categoryCheck(run, 'adblock', UBO);
  } catch (e) {
    row.notes.push(String(e.message ?? e).split('\n')[0]);
  } finally {
    if (run) await Promise.race([run.ctx.close(), sleep(15000)]);
    rmSync(profile, { recursive: true, force: true });
  }
  row.pass = row.install === 'pass' && row.enabled && row.background !== 'fail' && row.ui.result !== 'fail' && row.check.result !== 'fail';
  return row;
}

const version = execFileSync(browserPath, ['--version']).toString().trim();
const started = new Date();
const rows = [];
if (!only.length || only.includes('preinstalled')) {
  rows.push(await testPreinstalled());
  console.log(JSON.stringify(rows.at(-1)));
}
for (const e of EXTENSIONS) {
  if (only.length && !only.includes(e[0]) && !only.includes(e[2])) continue;
  rows.push(await testOne(e));
  console.log(JSON.stringify(rows.at(-1)));
}
site.close();
writeFileSync(join(work, 'results.json'), JSON.stringify({ version, date: started.toISOString(), rows }, null, 2));

if (!only.length) {
  const tested = rows.filter((r) => r.store !== 'bundled');
  const passed = tested.filter((r) => r.pass).length;
  const must = MUST_PASS.map((c) => {
    const rs = rows.filter((r) => r.category === c);
    return `${c} ${rs.filter((r) => r.pass).length}/${rs.length}`;
  }).join(', ');
  const cell = (c) => (c.result === 'n/a' ? 'n/a' : `${c.result}${c.note ? ` (${c.note.replace(/\|/g, '/')})` : ''}`);
  const md = [
    '# Extension compatibility',
    '',
    'Written by `build/test-extensions.sh` (do not edit by hand; rerun it).',
    '',
    `- Browser: ${version}, Linux (dev build), run ${started.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    `- Result: **${passed}/${tested.length} installed extensions pass** (target 85% on desktop); must-pass categories: ${must}.`,
    '- Each extension gets a fresh profile and is installed the way a user would: its store link or ID in `corvid://preferences` (or the Chrome Web Store page), then the real install prompt is clicked.',
    '- Checks: installed and enabled; background (service worker or page) running; popup or options page loads with no script error; a category check where one exists (ad blockers: an ad script on a known ad host is blocked, with the preinstalled uBlock Origin turned off; new tab: `chrome://newtab` shows the extension; dark mode: a white page turns dark; ClearURLs: tracking parameters are removed).',
    '- Not checked: features that need an account or a third-party site (password autofill, YouTube features, Grammarly suggestions).',
    '',
    '| Extension | Store | MV | Version | Installed | Background | Popup/options | Category check | Result | Notes |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.store} | ${r.mv ?? '?'} | ${r.version ?? '?'} | ${r.install}${r.install === 'pass' && !r.enabled ? ' (disabled)' : ''} | ${r.background} | ${cell(r.ui)} | ${cell(r.check)} | **${r.pass ? 'PASS' : 'FAIL'}** | ${r.notes.join('; ').replace(/\|/g, '/')} |`),
    '',
  ].join('\n');
  writeFileSync(outMd, md);
  console.log(`wrote ${outMd}: ${passed}/${tested.length} pass; must-pass ${must}`);
}
process.exit(0);
