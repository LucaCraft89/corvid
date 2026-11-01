// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors
//
// Phase 7 end-to-end check: real browser profiles keep each other in sync
// through the real server (sync/server), driven through corvid://sync.
//
//   npm run sync-check                      # every step
//
// Needs the Go toolchain (CORVID_GO, default /work/tools/go/bin/go) and
// CORVID_BROWSER or /work/src/out/Default/corvid. Everything runs on this
// computer. Prints PASS or FAIL per check; exits 1 on any failure.

import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const browserPath = process.env.CORVID_BROWSER ?? '/work/src/out/Default/corvid';
const go = process.env.CORVID_GO ?? '/work/tools/go/bin/go';
const PORT = 18443;
const SERVER = `http://127.0.0.1:${PORT}`;
const CONVERGE_MS = 120000;

const work = mkdtempSync(join(process.env.CORVID_TEST_TMP ?? tmpdir(), 'corvid-sync-check-'));
const db = join(work, 'sync.db');
const bin = join(work, 'corvid-sync-server');
const out = join(root, 'render-out');
mkdirSync(out, { recursive: true });

let passed = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
  return cond;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls fn until it returns something truthy. Returns it, or null on timeout. */
async function until(fn, ms = CONVERGE_MS) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = null;
      if (!/Execution context|navigat|Target|closed/i.test(String(e))) console.log(`  (retry: ${String(e).split('\n')[0]})`);
    }
    await sleep(1000);
  }
  return null;
}

// ------------------------------------------------------------------ server
let serverProcess = null;

async function startServer() {
  serverProcess = spawn(bin, ['serve', '--db', db, '--listen', `127.0.0.1:${PORT}`], { stdio: 'ignore' });
  const up = await until(async () => (await fetch(`${SERVER}/v1/health`)).ok, 15000);
  if (!up) throw new Error('server did not start');
}

async function stopServer() {
  if (!serverProcess) return;
  const p = serverProcess;
  serverProcess = null;
  const gone = new Promise((r) => p.once('exit', r));
  p.kill('SIGTERM');
  await gone;
}

const newToken = () => execFileSync(bin, ['token', '--db', db, '--account', 'alice']).toString().trim().split('\n')[0].trim();

// ----------------------------------------------------------------- browsers
class Device {
  constructor(name) {
    this.name = name;
    this.profile = join(work, `profile-${name}`);
    this.ctx = null;
    this.pages = {};
  }

  async start() {
    this.pages = {};
    const args = ['--no-first-run', '--no-default-browser-check', '--password-store=basic', '--corvid-sync-poll-seconds=5'];
    if (process.getuid?.() === 0) args.push('--no-sandbox');
    this.ctx = await chromium.launchPersistentContext(this.profile, {
      executablePath: browserPath,
      headless: true,
      args,
      ignoreDefaultArgs: ['--disable-sync', '--disable-background-networking', '--disable-extensions'],
    });
  }

  async stop() {
    if (this.ctx) await this.ctx.close();
    this.ctx = null;
  }

  /** One long-lived tab per internal page. */
  async page(url) {
    if (!this.pages[url] || this.pages[url].isClosed()) {
      const page = await this.ctx.newPage();
      // Debug builds only: Blink DCHECKs when a headless tab paints many frames
      // that are never presented, so long-lived test tabs can die. Reopen them.
      page.on('crash', () => { if (this.pages[url] === page) delete this.pages[url]; });
      page.on('dialog', (d) => d.accept());
      for (let attempt = 0; ; attempt++) {
        try {
          await page.goto(url, { waitUntil: 'load', timeout: 30000 });
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
          await sleep(500);
        }
      }
      this.pages[url] = page;
    }
    return this.pages[url];
  }

  /** The sync page, in front: it only polls the server while it is shown. */
  async sync() {
    const page = await this.page('chrome://sync/');
    await page.bringToFront();
    return page;
  }

  async view() {
    return (await this.sync()).evaluate(() => {
      const shown = (id) => !document.querySelector(`#${id}`).hidden;
      const text = (id) => document.querySelector(`#${id}`).textContent;
      return {
        setup: shown('setup'), waiting: shown('waiting'), active: shown('active'), revoked: shown('revoked'),
        joinCode: text('join-code'), status: text('status'), error: shown('error') ? text('error') : '',
        recovery: shown('recovery') ? text('recovery-key') : '',
        invite: shown('invite-box') ? text('invite-code') : '',
        pairCodes: [...document.querySelectorAll('#pairings .sync-code')].map((e) => e.textContent),
        devices: [...document.querySelectorAll('#devices [data-device]')].map((e) => ({ id: e.dataset.device, text: e.textContent })),
      };
    });
  }

  async fill(values) {
    const page = await this.sync();
    for (const [id, value] of Object.entries(values)) await page.fill(`#${id}`, value);
  }

  // Bookmarks, through the bookmarks page's own API.
  async bookmarks() {
    const page = await this.page('chrome://bookmarks/');
    return page.evaluate(async () => {
      const titles = [];
      const walk = (n) => { if (n.url) titles.push(n.title); (n.children ?? []).forEach(walk); };
      (await chrome.bookmarks.getTree()).forEach(walk);
      return titles.sort();
    });
  }

  async addBookmark(title) {
    const page = await this.page('chrome://bookmarks/');
    return page.evaluate((title) => chrome.bookmarks.create({ parentId: '1', title, url: `https://example.org/${encodeURIComponent(title)}` }).then((n) => n.id), title);
  }

  async renameBookmark(oldTitle, title) {
    const page = await this.page('chrome://bookmarks/');
    return page.evaluate(async ([oldTitle, title]) => {
      const [n] = await chrome.bookmarks.search({ title: oldTitle });
      await chrome.bookmarks.update(n.id, { title });
    }, [oldTitle, title]);
  }

  async removeBookmark(title) {
    const page = await this.page('chrome://bookmarks/');
    return page.evaluate(async (title) => {
      const [n] = await chrome.bookmarks.search({ title });
      await chrome.bookmarks.remove(n.id);
    }, title);
  }

  async hasBookmarks(want, notWant = []) {
    const have = await this.bookmarks();
    return want.every((t) => have.includes(t)) && notWant.every((t) => !have.includes(t));
  }

  // Settings: a pref that syncs, through the settings page's own API.
  async setPref(key, value) {
    const page = await this.page('chrome://settings/');
    return page.evaluate(([key, value]) => new Promise((r) => chrome.settingsPrivate.setPref(key, value, '', r)), [key, value]);
  }

  async getPref(key) {
    const page = await this.page('chrome://settings/');
    return page.evaluate((key) => new Promise((r) => chrome.settingsPrivate.getPref(key, (p) => r(p.value))), key);
  }

  // Passwords, through the password manager page's own API.
  async addPassword(url, username, password) {
    const page = await this.page('chrome://password-manager/');
    return page.evaluate(([url, username, password]) => chrome.passwordsPrivate.addPassword({ url, username, password, note: '', useAccountStore: false }), [url, username, password]);
  }

  async passwords() {
    const page = await this.page('chrome://password-manager/');
    return page.evaluate(() => new Promise((r) => chrome.passwordsPrivate.getSavedPasswordList((l) => r(l.map((p) => p.username)))));
  }

  async passwordValue(username) {
    const page = await this.page('chrome://password-manager/');
    return page.evaluate(async (username) => {
      const list = await chrome.passwordsPrivate.getSavedPasswordList();
      const entry = list.find((p) => p.username === username);
      const [details] = await chrome.passwordsPrivate.requestCredentialsDetails([entry.id]);
      return details.password;
    }, username);
  }

  /** History database of the profile (a copy: the browser holds it open). */
  historyHas(url) {
    const file = join(this.profile, 'Default', 'History');
    if (!existsSync(file)) return false;
    const copy = join(work, `history-${this.name}.db`);
    copyFileSync(file, copy);
    if (existsSync(`${file}-journal`)) copyFileSync(`${file}-journal`, `${copy}-journal`);
    else rmSync(`${copy}-journal`, { force: true });
    const py = 'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);print(c.execute("select count(*) from urls where url=?",(sys.argv[2],)).fetchone()[0])';
    return execFileSync('python3', ['-I', '-c', py, copy, url]).toString().trim() !== '0';
  }

  async screenshot(name) {
    await (await this.sync()).screenshot({ path: join(out, `sync-${name}.png`), fullPage: true });
  }
}

// One page to visit, so a device has real history.
const site = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><title>Corvid sync check ${req.url}</title>visited`);
});

/** Everything the server stores, to look for leaked plaintext. */
function serverBytes() {
  return Buffer.concat(readdirSync(work).filter((f) => f.startsWith('sync.db')).map((f) => readFileSync(join(work, f))));
}

async function pair(approver, joiner) {
  await (await approver.sync()).click('#invite-create');
  const invite = (await until(async () => (await approver.view()).invite, 20000));
  if (!ok(`${joiner.name}: invite code made on ${approver.name}`, !!invite)) return false;
  await joiner.fill({ server: SERVER, 'device-name': joiner.name, invite });
  await (await joiner.sync()).click('#join-form button[type=submit]');
  const code = await until(async () => {
    const v = await joiner.view();
    return v.waiting && /^\d{6}$/.test(v.joinCode) ? v.joinCode : null;
  }, 30000);
  if (!ok(`${joiner.name}: waits and shows a code`, !!code, JSON.stringify(await joiner.view()))) return false;
  const shown = await until(async () => (await approver.view()).pairCodes[0], 30000);
  ok(`${joiner.name}: both devices show the same code`, shown === code, `${shown} vs ${code}`);
  await (await approver.sync()).click('#pairings [data-approve]');
  const on = await until(async () => (await joiner.view()).active, 30000);
  return ok(`${joiner.name}: on after approval`, !!on, JSON.stringify(await joiner.view()));
}

async function main() {
  execFileSync(go, ['build', '-trimpath', '-o', bin, './server'], { cwd: join(root, '..', 'sync'), env: { ...process.env, CGO_ENABLED: '0', GOPATH: process.env.GOPATH ?? '/work/tools/gopath', GOCACHE: process.env.GOCACHE ?? '/work/tools/gocache' } });
  await startServer();
  await new Promise((r) => site.listen(18444, '127.0.0.1', r));
  const SITE = 'http://127.0.0.1:18444';

  const A = new Device('A');
  const B = new Device('B');
  const C = new Device('C');
  try {
    await A.start();
    await B.start();

    // ------------------------------------------------------ first device
    ok('A: setup form on a fresh profile', (await until(async () => (await A.view()).setup, 15000)) === true);
    // Wrong input is refused in the page, before anything is sent.
    await A.fill({ server: 'http://sync.example.org', 'device-name': 'A', token: 'x' });
    await (await A.sync()).click('#create-form button[type=submit]');
    ok('A: plain http to another computer is refused', (await (await A.sync()).textContent('#server-error')).length > 0);
    await A.fill({ server: SERVER, token: 'wrong-token' });
    await (await A.sync()).click('#create-form button[type=submit]');
    ok('A: a wrong token shows an error', !!(await until(async () => (await A.view()).error, 15000)));

    await A.addBookmark('before-sync-A');
    await A.fill({ token: newToken() });
    await (await A.sync()).click('#create-form button[type=submit]');
    const recovery = await until(async () => (await A.view()).recovery, 30000);
    ok('A: vault created, recovery key shown', /^CVK1-/.test(recovery ?? ''), String(recovery));
    ok('A: on', (await until(async () => (await A.view()).active, 15000)) === true);
    await A.screenshot('on');

    // ------------------------------------------------------------ pairing
    await B.addBookmark('before-sync-B');
    await B.sync();
    if (!(await pair(A, B))) throw new Error('pairing failed');
    await A.screenshot('devices');

    // --------------------------------------------------- bookmarks first
    ok('bookmarks: what each device had before merges', !!(await until(async () => (await A.hasBookmarks(['before-sync-A', 'before-sync-B'])) && B.hasBookmarks(['before-sync-A', 'before-sync-B']))));
    await A.addBookmark('from-A');
    ok('bookmarks: A to B', !!(await until(() => B.hasBookmarks(['from-A']))));
    await B.addBookmark('from-B');
    ok('bookmarks: B to A', !!(await until(() => A.hasBookmarks(['from-B']))));
    await A.renameBookmark('from-A', 'from-A-renamed');
    ok('bookmarks: rename reaches B', !!(await until(() => B.hasBookmarks(['from-A-renamed'], ['from-A']))));
    await B.removeBookmark('from-B');
    ok('bookmarks: delete reaches A', !!(await until(() => A.hasBookmarks([], ['from-B']))));

    // ----------------------------------------------------------- settings
    const pref = 'browser.show_home_button';
    const before = await A.getPref(pref);
    await A.setPref(pref, !before);
    ok('settings: A to B', !!(await until(async () => (await B.getPref(pref)) === !before)));

    // ------------------------------------------------------------ history
    const visited = `${SITE}/visited-on-A`;
    const tab = await A.ctx.newPage();
    await tab.goto(visited);
    await tab.close();
    ok('history: a visit on A reaches B', !!(await until(() => B.historyHas(`${visited}`))));

    // ---------------------------------------------------------- passwords
    const USER = 'corvid-test-user';
    const SECRET = 'corvid-test-password-3141';
    await A.addPassword('https://login.example.org/', USER, SECRET);
    ok('passwords: A to B', !!(await until(async () => (await B.passwords()).includes(USER))));
    ok('passwords: the password itself opens on B', (await B.passwordValue(USER)) === SECRET);

    // ------------------------------------------------ the server stays blind
    await sleep(2000);
    const stored = serverBytes();
    for (const plain of ['from-A-renamed', 'before-sync-A', 'visited-on-A', USER, SECRET, 'example.org']) {
      ok(`server: "${plain}" not in its files`, !stored.includes(plain));
    }

    // ------------------------------------------------------- offline edits
    // SYNC_CHECK_SKIP_OFFLINE: while debugging the later steps only.
    if (!process.env.SYNC_CHECK_SKIP_OFFLINE) {
    await stopServer();
    await A.addBookmark('offline-A');
    await B.addBookmark('offline-B');
    await A.renameBookmark('before-sync-A', 'offline-rename-A');
    await B.removeBookmark('before-sync-B');
    await A.setPref(pref, before);
    await sleep(8000);
    ok('offline: each device still has only its own edits', (await A.hasBookmarks(['offline-A'], ['offline-B'])) && (await B.hasBookmarks(['offline-B'], ['offline-A'])));
    await startServer();
    const offlineWant = ['offline-A', 'offline-B', 'offline-rename-A'];
    const offlineGone = ['before-sync-A', 'before-sync-B'];
    ok('offline: A has both sides after the server is back', !!(await until(() => A.hasBookmarks(offlineWant, offlineGone), 300000)), JSON.stringify(await A.bookmarks()));
    ok('offline: B has both sides after the server is back', !!(await until(() => B.hasBookmarks(offlineWant, offlineGone), 300000)), JSON.stringify(await B.bookmarks()));
    ok('offline: a setting changed offline arrives', !!(await until(async () => (await B.getPref(pref)) === before)));

    // ---------------------------------------------- browser closed, restart
    await B.stop();
    await A.addBookmark('while-B-closed');
    await sleep(8000);
    await B.start();
    ok('restart: B is still set up, no pairing again', (await until(async () => (await B.view()).active, 30000)) === true);
    ok('restart: B catches up', !!(await until(() => B.hasBookmarks(['while-B-closed']))));
    await B.addBookmark('after-B-restart');
    ok('restart: B still sends', !!(await until(() => A.hasBookmarks(['after-B-restart']))));
    }

    // ----------------------------------------------------------- recovery
    await C.start();
    await C.fill({ server: SERVER, 'device-name': 'C', 'recover-token': newToken(), 'recover-key': 'CVK1-AAAAA-TYPO' });
    await (await C.sync()).click('#recover-form button[type=submit]');
    ok('recovery: a mistyped key is refused', !!(await until(async () => (await C.view()).error, 15000)));
    await C.fill({ 'recover-key': recovery });
    await (await C.sync()).click('#recover-form button[type=submit]');
    ok('recovery: on with the recovery key', !!(await until(async () => (await C.view()).active, 30000)), JSON.stringify(await C.view()));
    ok('recovery: the data arrives on C', !!(await until(() => C.hasBookmarks(['from-A-renamed']))));
    ok('recovery: passwords arrive on C', !!(await until(async () => (await C.passwords()).includes(USER))));

    // ----------------------------------------------------------- revocation
    const cId = await until(async () => (await C.sync()).evaluate(() => [...document.querySelectorAll('#devices [data-device]')].find((e) => !e.querySelector('[data-remove]'))?.dataset.device));
    ok('revoke: C knows its own device id', !!cId);
    const listed = await until(async () => (await A.view()).devices.some((d) => d.id === cId));
    ok('revoke: A lists C', !!listed);
    await (await A.sync()).click(`[data-remove="${cId}"]`);
    const newKey = await until(async () => {
      const k = (await A.view()).recovery;
      return k && k !== recovery ? k : null;
    }, 60000);
    ok('revoke: A got a new recovery key', !!newKey);
    ok('revoke: C sees it was removed', !!(await until(async () => (await C.view()).revoked, 60000)), JSON.stringify(await C.view()));
    await A.addBookmark('after-rotation-A');
    ok('revoke: B follows the new key and receives', !!(await until(() => B.hasBookmarks(['after-rotation-A']), 180000)), JSON.stringify(await B.bookmarks()));
    await B.addBookmark('after-rotation-B');
    ok('revoke: A receives from B on the new key', !!(await until(() => A.hasBookmarks(['after-rotation-B']), 180000)));
    await sleep(10000);
    ok('revoke: C gets nothing new', await C.hasBookmarks([], ['after-rotation-A', 'after-rotation-B']));
    ok('revoke: A and B kept all their data', (await A.hasBookmarks(['from-A-renamed'])) && (await B.hasBookmarks(['from-A-renamed'])));
    await C.stop();

    // ------------------------------------------------------------- rollback
    // A server restored from an old backup must be noticed, not believed.
    await A.addBookmark('rollback-mark-1');
    await until(() => B.hasBookmarks(['rollback-mark-1']));
    await sleep(3000);
    await stopServer();
    const snapshot = join(work, 'old');
    mkdirSync(snapshot);
    for (const f of readdirSync(work).filter((x) => x.startsWith('sync.db'))) copyFileSync(join(work, f), join(snapshot, f));
    await startServer();
    await A.addBookmark('rollback-mark-2');
    await until(() => B.hasBookmarks(['rollback-mark-2']));
    await sleep(8000); // Let the checkpoint reach the prefs.
    await stopServer();
    for (const f of readdirSync(work).filter((x) => x.startsWith('sync.db'))) rmSync(join(work, f));
    for (const f of readdirSync(snapshot)) copyFileSync(join(snapshot, f), join(work, f));
    await startServer();
    await B.addBookmark('rollback-mark-3');
    const refused = await until(async () => /integrity|older/.test((await B.view()).status) ? (await B.view()).status : null, 180000);
    ok('rollback: B reports it and stops', !!refused, (await B.view()).status);
    ok('rollback: B kept its data', await B.hasBookmarks(['rollback-mark-1', 'rollback-mark-2', 'rollback-mark-3']));
    await B.screenshot('rollback');

    // ------------------------------------------- what is selected for syncing
    await A.stop();
    const prefs = JSON.parse(readFileSync(join(A.profile, 'Default', 'Preferences'), 'utf8')).sync ?? {};
    ok('types: "sync everything" is off', prefs.keep_everything_synced === false, JSON.stringify(prefs.keep_everything_synced));
    ok('types: open tabs are not selected', prefs.tabs !== true, JSON.stringify(prefs.tabs));
    ok('types: bookmarks, passwords, settings and history are', prefs.bookmarks === true && prefs.passwords === true && prefs.preferences === true && prefs.typed_urls === true, JSON.stringify(prefs));
  } finally {
    for (const d of [A, B, C]) await d.stop().catch(() => {});
    await stopServer();
    site.close();
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(`Failed:\n  ${failures.join('\n  ')}\nLeft for inspection: ${work}`);
    process.exit(1);
  }
  rmSync(work, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  console.log(`Left for inspection: ${work}`);
  process.exit(2);
});
