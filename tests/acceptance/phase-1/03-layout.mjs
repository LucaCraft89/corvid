#!/usr/bin/env node
// Acceptance 3: move tab strip top->left, hide bookmarks bar, resize side panel, restart: layout restored.
// Then corrupt the layout file: browser starts with the default; "Reset layout" restores default from a corrupt file.
// Uses the --corvid-test-hooks contract (window.__corvidTest, see ui/chrome/shell.ts). REQUIRES CORVID_BIN. UNVERIFIED.
import { mkdtempSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker, launch, requireBrowser, sleepMs } from './lib/cdp.mjs';

const bin = requireBrowser();
const c = checker('layout');
const profile = mkdtempSync(join(tmpdir(), 'corvid-layout-'));
const SHELL = 'corvid://chrome-shell';
const T = (expr) => `window.__corvidTest.${expr}`;

let b = await launch({ bin, profile });
let p = await b.attach(SHELL) ?? await b.open(SHELL);
await p.waitFor(`!!window.__corvidTest`, 8000);
const before = await p.eval(T('layout()'));
await p.eval(T('tabsTo("left")'));
await p.eval(T('setVisible("bookmarksbar", false)'));
await p.eval(T('setVisible("sidepanel", true)'));
await p.eval(T('resize("sidepanel", 30)'));
await p.eval(T('flush()'));
const edited = await p.eval(T('layout()'));
c.ok(edited.regions.left.slots.some((s) => s.component === 'corvid-tabstrip'), 'tab strip is in the left region after edit');
await b.close({ keepProfile: true });

b = await launch({ bin, profile });
p = await b.attach(SHELL) ?? await b.open(SHELL);
await p.waitFor(`!!window.__corvidTest`, 8000);
const after = await p.eval(T('layout()'));
c.ok(JSON.stringify(after) === JSON.stringify(edited), 'layout identical after restart');
c.ok(JSON.stringify(after) !== JSON.stringify(before), 'restored layout differs from default (edit really persisted)');
await b.close({ keepProfile: true });

// corrupt the persisted file (locate by name inside the profile)
const find = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? find(join(dir, d.name)) : d.name === 'layout.json' ? [join(dir, d.name)] : []);
const files = find(profile);
c.ok(files.length === 1, `exactly one layout.json in profile (${files.length})`);
if (files[0]) writeFileSync(files[0], readFileSync(files[0], 'utf8').slice(0, 40));
b = await launch({ bin, profile });
p = await b.attach(SHELL) ?? await b.open(SHELL);
await p.waitFor(`!!window.__corvidTest`, 8000);
const fallback = await p.eval(T('layout()'));
c.ok(fallback.name === 'desktop-classic' && fallback.regions.top.slots.some((s) => s.component === 'corvid-tabstrip'), 'corrupt file -> default layout');
await p.eval(T('tabsTo("left")'));
await p.eval(T('reset()'));
await p.eval(T('flush()'));
const reset = await p.eval(T('layout()'));
c.ok(reset.regions.top.slots.some((s) => s.component === 'corvid-tabstrip'), 'Reset layout restores tab strip to top');
const settings = await b.open('corvid://settings/layout#reset');
await sleepMs(500);
c.ok(await settings.eval(`document.querySelector('corvid-settings') !== null`), 'corvid://settings/layout#reset reachable');
await b.close();
c.done();
