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
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    ignoreDefaultArgs: ['--disable-extensions', '--disable-hang-monitor'],
  });
}

/** Like launch(), but headed and with extra environment variables. */
async function launchWithEnv(profile, env) {
  const args = ['--no-first-run', '--no-default-browser-check'];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  return chromium.launchPersistentContext(profile, {
    executablePath: browserPath, headless: false, args, viewport: null,
    ignoreDefaultArgs: ['--disable-extensions', '--disable-hang-monitor'], env: { ...process.env, ...env },
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

// ---------------------------------------------------------------- desktop accent colour
// Needs a real window (GTK): runs on DISPLAY, or starts Xvfb. Each case gets a
// private session bus, with or without the fake portal (fake-portal.py).
function sh(cmd, args, opts = {}) {
  return spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

async function privateBus() {
  const p = sh('dbus-daemon', ['--session', '--nofork', '--print-address=1']);
  const addr = await new Promise((r) => p.stdout.once('data', (d) => r(String(d).trim())));
  return { addr, stop: () => p.kill() };
}

async function startPortal(addr, rgb) {
  const p = sh('python3', [join(root, 'scripts', 'fake-portal.py'), ...rgb.map(String)], { env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: addr } });
  await new Promise((r) => p.stdout.once('data', r));
  return () => p.kill();
}

/** Most common colour in the top 40 px of the screen (the browser frame), as #rrggbb. */
function frameColour(png) {
  const py = `import sys
from PIL import Image
from collections import Counter
im = Image.open(sys.argv[1]).convert('RGB')
c = Counter(p for p in im.crop((0, 0, im.width, 40)).getdata() if p != (0, 0, 0))
print('#%02x%02x%02x' % c.most_common(1)[0][0])`;
  return execFileSync('python3', ['-c', py, png]).toString().trim();
}

async function screen(name) {
  const png = join(out, `browser-${name}.png`);
  execFileSync('import', ['-window', 'root', png], { env: process.env });
  return frameColour(png);
}

CHECKS.accent = async () => {
  const w = 'accent';
  let xvfb = null;
  if (!process.env.DISPLAY) {
    xvfb = sh('Xvfb', [':78', '-screen', '0', '1280x900x24']);
    process.env.DISPLAY = ':78';
    await new Promise((r) => setTimeout(r, 1000));
  }
  const home = freshProfile();
  mkdirSync(join(home, '.config', 'gtk-3.0'), { recursive: true });
  const run = async (name, { gtkRed = false, portal = null } = {}) => {
    rmSync(join(home, '.config', 'gtk-3.0', 'gtk.css'), { force: true });
    if (gtkRed) writeFileSync(join(home, '.config', 'gtk-3.0', 'gtk.css'), '*:selected { background-color: #e01b24; }\n');
    const bus = await privateBus();
    const stopPortal = portal ? await startPortal(bus.addr, portal) : () => {};
    const ctx = await launchWithEnv(freshProfile(), { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), DBUS_SESSION_BUS_ADDRESS: bus.addr });
    await new Promise((r) => setTimeout(r, 2500));
    const ntp = await open(ctx, 'chrome://newtab/', `${w}/${name}`);
    const res = { ctx, ntp, bus: bus.addr, accent: await ntp.evaluate(() => window.corvidInit?.accent ?? null), frame: await screen(`accent-${name}`), stop: () => { stopPortal(); bus.stop(); } };
    console.log(`  ${name}: page accent ${res.accent}, browser frame ${res.frame}`);
    return res;
  };
  const close = async (r) => { await r.ctx.close(); r.stop(); };
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  try {
    // No portal, stock GTK theme (Adwaita): its selection colour.
    const plain = await run('gtk-default');
    ok(w, /^#[0-9a-f]{6}$/.test(plain.accent ?? ''), `no accent from the GTK theme: ${plain.accent}`);
    await close(plain);

    // No portal, GTK theme with a red selection colour.
    const red = await run('gtk-red', { gtkRed: true });
    ok(w, red.accent === '#e01b24', `GTK selection colour not used: ${red.accent}`);
    const [r1, g1, b1] = rgb(red.frame);
    ok(w, red.frame !== plain.frame && r1 > g1 && r1 > b1, `browser frame does not follow the red GTK accent (${plain.frame} -> ${red.frame})`);
    await close(red);

    // Portal accent wins over the GTK theme, and changes apply live.
    const green = await run('portal-green', { gtkRed: true, portal: [0.2, 0.6, 0.2] });
    ok(w, green.accent === '#339933', `portal accent not used: ${green.accent}`);
    const [r2, g2, b2] = rgb(green.frame);
    ok(w, g2 > r2 && g2 > b2, `browser frame does not follow the green portal accent (${green.frame})`);
    const settings = await open(green.ctx, 'chrome://preferences/', `${w}/portal`);
    const swatch = () => settings.evaluate(() => document.querySelector('#swatches .swatch.system span')?.style.getPropertyValue('--swatch'));
    ok(w, (await swatch()) === '#339933', `settings swatch shows ${await swatch()}`);
    execFileSync('dbus-send', ['--session', '--type=method_call', '--dest=org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop',
      'org.corvid.Test.SetAccent', 'double:0.8', 'double:0.4', 'double:0'], { env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: green.bus } });
    await settings.waitForTimeout(1500);
    ok(w, (await swatch()) === '#cc6600', `live accent change did not reach the page: ${await swatch()}`);
    await green.ntp.bringToFront();
    await green.ntp.waitForTimeout(500);
    const orange = await screen('accent-portal-orange');
    const [r3, g3, b3] = rgb(orange);
    console.log(`  portal-orange (live): browser frame ${orange}`);
    ok(w, r3 > g3 && g3 > b3, `browser frame did not follow the live accent change (${orange})`);
    await close(green);
  } finally {
    xvfb?.kill();
  }
};

// ---------------------------------------------------------------- diagnostics
CHECKS.diagnostics = async () => {
  const w = 'diagnostics';
  const srv = await startServers();
  const profileDir = freshProfile();
  const ctx = await launch(profileDir, ['--host-resolver-rules=MAP selfsigned.test 127.0.0.1']);
  try {
    const d = await open(ctx, 'chrome://diagnostics/', w);
    ok(w, await d.$('#list') !== null, 'chrome://diagnostics is not the Corvid page');
    await d.click('#clear');
    await d.waitForTimeout(300);
    const entries = () => d.$$eval('#list .diag-entry', (els) => els.map((e) => ({ kind: e.dataset.kind, text: e.textContent })));
    ok(w, (await entries()).length === 0, 'clear did not empty the log');
    const waitFor = async (pred, ms) => {
      for (let t = 0; t < ms; t += 250) {
        const list = await entries();
        if (list.some(pred)) return true;
        await d.waitForTimeout(250);
      }
      return false;
    };

    const tab = await open(ctx, 'http://does-not-exist.invalid/', w);
    ok(w, await waitFor((e) => e.kind === 'network' && e.text.includes('does-not-exist.invalid') && e.text.includes('ERR_NAME_NOT_RESOLVED'), 3000), 'network error not logged (live)');
    await tab.goto(`https://selfsigned.test:${srv.tlsPort}/`).catch(() => {});
    ok(w, await waitFor((e) => e.kind === 'tls' && e.text.includes('selfsigned.test') && e.text.includes('ERR_CERT_'), 3000), 'certificate error not logged');

    const crash = await ctx.newPage();
    await crash.goto('chrome://crash').catch(() => {});
    ok(w, await waitFor((e) => e.kind === 'crash' && e.text.includes('Renderer'), 5000), 'renderer crash not logged');

    // A child process crash: the network service, crashed from outside.
    const ps = execFileSync('ps', ['-eo', 'pid=,args=']).toString().split('\n');
    const net = ps.find((l) => l.includes(profileDir) && l.includes('network.mojom.NetworkService'));
    if (!net) fail(w, 'network service process not found');
    else {
      process.kill(Number(net.trim().split(' ')[0]), 'SIGSEGV');
      ok(w, await waitFor((e) => e.kind === 'crash' && e.text.includes('Utility') && e.text.includes('NetworkService'), 8000), 'network service crash not logged');
    }

    await d.bringToFront();
    await shot(d, 'diagnostics');
    const list = await entries();
    console.log(`  ${list.length} entries:\n${list.map((e) => `    ${e.kind}: ${e.text}`).join('\n')}`);
    await ctx.close().catch(() => {});

    // Private windows: logged without the site.
    const browser = await chromium.launch({ executablePath: browserPath, headless: !process.env.DISPLAY,
      args: ['--no-first-run', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])] });
    const otr = await browser.newContext();
    await open(otr, 'http://does-not-exist.invalid/', w);
    const pd = await open(otr, 'chrome://diagnostics/', w);
    const priv = await pd.$$eval('#list .diag-entry', (els) => els.map((e) => e.textContent));
    ok(w, priv.length >= 1 && priv.every((t) => !t.includes('does-not-exist.invalid')), `private window entry shows the site: ${JSON.stringify(priv)}`);
    await browser.close();
  } finally {
    await ctx.close().catch(() => {});
    srv.close();
  }
};

// ---------------------------------------------------------------- hang
// Chromium ignores hangs of tabs a debugger is attached to, and Playwright
// attaches to every tab. So: start the browser without automation, open a
// page stuck in a script loop through the DevTools HTTP endpoint (which does
// not attach), click into it with xdotool, and only connect afterwards.
CHECKS.hang = async () => {
  const w = 'hang';
  let xvfb = null;
  if (!process.env.DISPLAY) {
    xvfb = sh('Xvfb', [':78', '-screen', '0', '1280x900x24']);
    process.env.DISPLAY = ':78';
    await new Promise((r) => setTimeout(r, 1000));
  }
  const port = 9339;
  const args = [`--user-data-dir=${freshProfile()}`, '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, '--window-position=0,0', '--window-size=1200,850'];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  const proc = sh(browserPath, args);
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      await new Promise((r) => setTimeout(r, 250));
      up = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok, () => false);
    }
    ok(w, up, 'browser did not start');
    await new Promise((r) => setTimeout(r, 5000));  // let the window appear and paint
    const page = 'data:text/html,<title>busy</title><script>setTimeout(() => { for (;;) {} }, 300)</script>';
    await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(page)}`, { method: 'PUT' });
    await new Promise((r) => setTimeout(r, 3000));
    execFileSync('xdotool', ['mousemove', '600', '500', 'click', '1'], { env: process.env });
    execFileSync('xdotool', ['key', 'a'], { env: process.env });
    execFileSync('import', ['-window', 'root', join(out, 'browser-hang-page.png')], { env: process.env });
    // The hang monitor waits 30 s for the input to be handled.
    await new Promise((r) => setTimeout(r, 36000));
    // Read chrome://diagnostics over a DevTools socket to that tab only (any
    // client that attaches to every tab would wait for the hung one).
    const target = await fetch(`http://127.0.0.1:${port}/json/new?chrome://diagnostics/`, { method: 'PUT' }).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 1500));
    const expr = `JSON.stringify([...document.querySelectorAll('#list .diag-entry')].map((e) => ({ kind: e.dataset.kind, text: e.textContent })))`;
    const client = `const ws = new WebSocket(process.argv[1]);
ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: process.argv[2], returnByValue: true } }));
ws.onmessage = (m) => { const r = JSON.parse(m.data); if (r.id === 1) { console.log(r.result.result.value); process.exit(0); } };`;
    const list = JSON.parse(execFileSync(process.execPath, ['--experimental-websocket', '--no-warnings', '-e', client, target.webSocketDebuggerUrl, expr], { timeout: 15000 }).toString());
    console.log(`  entries: ${JSON.stringify(list.map((e) => e.text))}`);
    ok(w, list.some((e) => e.kind === 'hang'), 'hang not logged');
    execFileSync('import', ['-window', 'root', join(out, 'browser-diagnostics-hang.png')], { env: process.env });
  } finally {
    proc.kill();
    xvfb?.kill();
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
for (const d of profiles) {
  try {
    rmSync(d, { recursive: true, force: true });
  } catch {
    // A browser still shutting down may write into it; leave it.
  }
}
console.log(`\n${passed} checks passed, ${failures.length} failed`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
