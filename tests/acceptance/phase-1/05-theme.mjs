#!/usr/bin/env node
// Driver for 05-theme.sh. Flips the OS accent/scheme and measures how long Corvid's --cv-color-primary takes to change.
import { execFileSync } from 'node:child_process';
import { checker, launch, requireBrowser, sleepMs } from './lib/cdp.mjs';

const bin = requireBrowser();
const kde = process.env.CORVID_THEME_DESKTOP === 'kde';
const c = checker(`theme-${kde ? 'kde' : 'gnome'}`);
const T = (e) => `window.__corvidTest.${e}`;

const setScheme = (dark) => kde
  ? execFileSync('plasma-apply-colorscheme', [dark ? 'BreezeDark' : 'BreezeLight'])
  : execFileSync('gsettings', ['set', 'org.gnome.desktop.interface', 'color-scheme', dark ? 'prefer-dark' : 'prefer-light']);
const setAccent = (name, rgb) => kde
  ? execFileSync('kwriteconfig6', ['--file', 'kdeglobals', '--group', 'General', '--key', 'AccentColor', rgb])
  : execFileSync('gsettings', ['set', 'org.gnome.desktop.interface', 'accent-color', name]);

const b = await launch({ bin, extraArgs: [] });
const p = await b.open('corvid://chrome-shell');
await p.waitFor(`!!window.__corvidTest`, 8000);

async function timeToChange(action, probe) {
  const before = await p.eval(probe);
  const t0 = Date.now();
  action();
  const ok = await p.waitFor(`(${probe}) !== ${JSON.stringify(before)}`, 3000);
  return ok ? Date.now() - t0 : Infinity;
}

setScheme(false); setAccent('blue', '53,132,228'); await sleepMs(1500);
const primary = `${T('tokens()')}['--cv-color-primary']`;
const dt1 = await timeToChange(() => setAccent('red', '230,45,66'), primary);
c.ok(dt1 <= 1000, `accent change recolored in ${dt1} ms (<= 1000)`);
const mode = `${T('resolvedTheme()')}.mode`;
const dt2 = await timeToChange(() => setScheme(true), mode);
c.ok(dt2 <= 1000, `dark mode toggle applied in ${dt2} ms (<= 1000)`);

await p.eval(`${T('setThemePrefs')}({ seed: '#3a944a' })`);
const pinned = await p.eval(primary);
setAccent('purple', '145,65,172'); await sleepMs(1500);
c.ok((await p.eval(primary)) === pinned, 'manual seed override wins over system accent');
await b.close();
c.done();
