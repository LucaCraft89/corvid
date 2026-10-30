// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors
//
// Opens every page in a real browser at phone, tablet and desktop widths,
// light and dark, and fails on: console errors (including CSP violations),
// horizontal scrolling, unfilled strings, or broken interactions.
// Screenshots go to render-out/.
//
//   npm run render-check                       # uses CORVID_BROWSER or the dev build
//   CORVID_BROWSER=/usr/bin/chromium npm run render-check

import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist } from './serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'render-out');
mkdirSync(out, { recursive: true });

const browserPath = process.env.CORVID_BROWSER ?? ['/work/src/out/Default/corvid', '/usr/bin/chromium'].find(existsSync);
if (!browserPath) {
  console.error('No browser found. Set CORVID_BROWSER to a Chromium-based binary.');
  process.exit(2);
}

const VIEWPORTS = { phone: { width: 360, height: 780 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } };
const samples = [...readFileSync(join(root, 'src/pages/error/samples.ts'), 'utf8').matchAll(/^  '?([\w-]+)'?: \{$/gm)].map((m) => m[1]);
const PAGES = [['index', ''], ['newtab', 'newtab/'], ['settings', 'settings/'], ...samples.map((s) => [`error-${s}`, `error/?sample=${s}`])];

const server = await serveDist(0, '127.0.0.1');
const base = `http://127.0.0.1:${server.address().port}/`;
// Root cannot use the sandbox; this only loads our own pages from localhost.
const browser = await chromium.launch({ executablePath: browserPath, args: process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
console.log(`browser: ${browserPath} (${browser.version()})`);

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);
let shots = 0;
let retries = 0;

async function open(context, path, where) {
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && fail(where, `console: ${m.text()}`));
  page.on('pageerror', (e) => fail(where, `page error: ${e.message}`));
  // The Corvid dev build sometimes cancels the first navigation of a fresh
  // tab before any request is sent (net::ERR_ABORTED, still about:blank).
  // That is the browser, not the page: retry it, and report how often.
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(base + path, { waitUntil: 'load', timeout: 30000 });
      break;
    } catch (e) {
      if (attempt >= 3 || !/ERR_ABORTED/.test(e.message) || page.url() !== 'about:blank') throw e;
      retries++;
      await page.waitForTimeout(250);
    }
  }
  await page.waitForTimeout(150);
  return page;
}

async function checkLayout(page, where) {
  const r = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
    emptyStrings: [...document.querySelectorAll('[data-i18n]')].filter((e) => !e.textContent.trim()).length,
    placeholders: /\{\w+\}/.test(document.body.innerText),
    title: document.title,
    bg: getComputedStyle(document.body).backgroundColor,
    // Visible elements poking out of the viewport on the right (scroll containers excluded).
    overflow: [...document.querySelectorAll('body *')].filter((e) => {
      if (e.closest('.settings-nav, .visually-hidden, dialog:not([open])')) return false;
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.right > window.innerWidth + 1;
    }).map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : e.className ? '.' + String(e.className).split(' ')[0] : '')).slice(0, 5),
  }));
  if (r.scrollWidth > r.width) fail(where, `scrolls sideways (${r.scrollWidth} > ${r.width})`);
  if (r.overflow.length) fail(where, `elements past the right edge: ${r.overflow.join(', ')}`);
  if (r.emptyStrings) fail(where, `${r.emptyStrings} empty strings`);
  if (r.placeholders) fail(where, 'unfilled {placeholder} in text');
  if (!r.title) fail(where, 'no title');
  return r;
}

// 1. Every page, every width, light and dark.
for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport, colorScheme: scheme, hasTouch: vpName === 'phone' });
    const bgs = new Set();
    for (const [name, path] of PAGES) {
      const where = `${name} ${vpName} ${scheme}`;
      const page = await open(context, path, where);
      const r = await checkLayout(page, where);
      bgs.add(r.bg);
      await page.screenshot({ path: join(out, `${name}-${vpName}-${scheme}.png`), fullPage: true });
      shots++;
      await page.close();
    }
    if (bgs.size !== 1) fail(`${vpName} ${scheme}`, `pages disagree on the background: ${[...bgs].join(' ')}`);
    await context.close();
  }
}

// 2. Interactions: settings change the theme, the search engine and density,
//    and the new tab page follows; shortcuts can be added; SSL rules hold.
try {
  const where = 'interaction';
  const context = await browser.newContext({ viewport: VIEWPORTS.phone, colorScheme: 'light' });
  const s = await open(context, 'settings/', where);
  const bgBefore = await s.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await s.click('#mode label:nth-child(3)'); // Dark
  const bgAfter = await s.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (bgBefore === bgAfter) fail(where, 'choosing Dark did not change the page');
  await s.click('#engines .engine:has(input[value="mojeek"]) label');
  await s.click('#swatches label:nth-child(3)'); // Teal
  const h1 = await s.evaluate(() => document.querySelector('#mode span').getBoundingClientRect().height);
  await s.click('#density label:nth-child(2)'); // Compact
  const h2 = await s.evaluate(() => document.querySelector('#mode span').getBoundingClientRect().height);
  if (!(h2 < h1)) fail(where, `compact density did not shrink controls (${h1} -> ${h2})`);
  const aa = await s.textContent('#aa-status');
  if (!/easy to read/.test(aa)) fail(where, `AA status: ${aa}`);
  // Custom engine: invalid first, then valid.
  await s.click('#add-engine');
  await s.fill('#en-name', 'Example');
  await s.fill('#en-url', 'https://search.example/?q=');
  await s.click('#engine-form button[type=submit]');
  if (!(await s.isVisible('#engine-dialog'))) fail(where, 'invalid engine URL was accepted');
  await s.fill('#en-url', 'https://search.example/?q=%s');
  await s.click('#engine-form button[type=submit]');
  if (await s.isVisible('#engine-dialog')) fail(where, 'valid engine was refused');
  await s.click('#engines .engine:has(input[value="mojeek"]) label');
  await s.screenshot({ path: join(out, 'interaction-settings-after.png'), fullPage: true });
  shots++;

  const n = await open(context, 'newtab/', where);
  const placeholder = await n.getAttribute('#q', 'placeholder');
  if (!placeholder.includes('Mojeek')) fail(where, `new tab does not use the chosen engine: ${placeholder}`);
  const dark = await n.evaluate(() => document.documentElement.dataset.themeMode);
  if (dark !== 'dark') fail(where, 'new tab did not pick up the dark theme');
  await n.click('.tile-add');
  await n.fill('#sc-url', 'not an address');
  await n.click('#shortcut-form button[type=submit]');
  if (!(await n.isVisible('#sc-url-error'))) fail(where, 'bad shortcut address shows no error');
  await n.fill('#sc-name', 'Example');
  await n.fill('#sc-url', 'example.org');
  await n.click('#shortcut-form button[type=submit]');
  const tiles = await n.$$eval('.tile a', (as) => as.map((a) => a.href));
  if (tiles[0] !== 'https://example.org/') fail(where, `shortcut not added: ${tiles}`);
  // Live update: change density in settings, the open new tab follows.
  await s.click('#density label:nth-child(3)');
  await n.waitForTimeout(100);
  if ((await n.evaluate(() => document.documentElement.dataset.density)) !== 'spacious') fail(where, 'open new tab did not follow a settings change');
  await n.screenshot({ path: join(out, 'interaction-newtab-after.png'), fullPage: true });
  shots++;
  // Search goes to the chosen engine.
  await n.route('https://www.mojeek.com/**', (r) => r.fulfill({ body: 'ok' }));
  await n.fill('#q', 'corvid birds');
  await Promise.all([n.waitForURL(/mojeek/), n.press('#q', 'Enter')]);
  if (!n.url().startsWith('https://www.mojeek.com/search?q=corvid%20birds')) fail(where, `search went to ${n.url()}`);

  const e1 = await open(context, 'error/?sample=ssl', where);
  if (!(await e1.$('#err-proceed:not([hidden])'))) fail(where, 'SSL page hides "continue" for an overridable error');
  if (await e1.isVisible('#err-proceed')) fail(where, '"continue" is visible before opening the details');
  const e2 = await open(context, 'error/?sample=ssl-hsts', where);
  if (await e2.$('#err-proceed:not([hidden])')) fail(where, 'SSL page offers "continue" for an HSTS site');
  await context.close();
} catch (e) {
  fail('interaction', `stopped: ${e.message.split('\n')[0]}`);
}

await browser.close();
server.close();
console.log(`${PAGES.length} pages x ${Object.keys(VIEWPORTS).length} widths x 2 schemes, ${shots} screenshots in render-out/, ${retries} aborted first navigations retried`);
if (failures.length) {
  console.log(`FAIL (${failures.length})`);
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log('PASS');
