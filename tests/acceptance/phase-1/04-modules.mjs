#!/usr/bin/env node
// Acceptance 4: a sample ui-mod (custom panel) installs without a rebuild; denied permission is refused; unload frees resources.
// Uses window.__corvidTest.installUiMod (prompter auto-denies when CORVID_TEST_DENY=1). REQUIRES CORVID_BIN. UNVERIFIED.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checker, launch, requireBrowser } from './lib/cdp.mjs';

const bin = requireBrowser();
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../../modules/examples/sample-panel/module.json', import.meta.url)), 'utf8'));
const c = checker('modules');
const T = (e) => `window.__corvidTest.${e}`;

let b = await launch({ bin });
let p = await b.open('corvid://chrome-shell');
await p.waitFor(`!!window.__corvidTest`, 8000);
await p.eval(`${T('installUiMod')}(${JSON.stringify(manifest)}).then(() => true)`);
const loaded = await p.eval(T('loadedModules()'));
c.ok(loaded.includes('example.sample-panel'), 'ui-mod installed and loaded without rebuilding');
c.ok((await p.eval(T('resourceCount("example.sample-panel")'))) > 0, 'ui-mod holds tracked resources while loaded');
await p.eval(`${T('unloadModule')}("example.sample-panel").then(() => true)`);
c.ok((await p.eval(T('resourceCount("example.sample-panel")'))) === 0, 'unload frees all tracked resources');
c.ok(!(await p.eval(T('loadedModules()'))).includes('example.sample-panel'), 'module no longer loaded');
await b.close();

b = await launch({ bin, env: { CORVID_TEST_DENY: '1' } });
p = await b.open('corvid://chrome-shell');
await p.waitFor(`!!window.__corvidTest`, 8000);
const refused = await p.eval(`${T('installUiMod')}(${JSON.stringify({ ...manifest, id: 'example.denied' })}).then(() => 'loaded', (e) => e.name)`);
c.ok(refused === 'PermissionDeniedError', `denied permission refused (got ${refused})`);
c.ok(!(await p.eval(T('loadedModules()'))).includes('example.denied'), 'refused module is not loaded');
await b.close();
c.done();
