import { test } from 'node:test';
import assert from 'node:assert/strict';
import { argbToHex, resolveMode, toScheme, createWindowsProvider, type RawReading, type WindowsBridge } from './index.ts';

const WHITE = 0xffffffff, BLACK = 0xff000000;

function fakeBridge(initial: RawReading | null) {
  let cur = initial;
  let cb: (() => void) | undefined;
  const bridge: WindowsBridge = {
    read: () => cur,
    subscribe: (f) => { cb = f; return () => { cb = undefined; }; },
  };
  return { bridge, set: (r: RawReading | null) => { cur = r; cb?.(); }, subscribed: () => cb !== undefined };
}

test('argbToHex drops alpha', () => {
  assert.equal(argbToHex(0xff0078d4), '#0078d4');
  assert.equal(argbToHex(0xff00000f), '#00000f');
});

test('mode: light foreground => dark theme; registry fallback', () => {
  assert.equal(resolveMode({ foregroundArgb: WHITE }), 'dark');
  assert.equal(resolveMode({ foregroundArgb: BLACK }), 'light');
  assert.equal(resolveMode({ appsUseLightTheme: 0 }), 'dark');
  assert.equal(resolveMode({ appsUseLightTheme: 1 }), 'light');
  assert.equal(resolveMode({}), 'light');
});

test('unavailable UISettings falls back, no accent', () => {
  const s = toScheme(null);
  assert.equal(s.source, 'fallback');
  assert.equal(s.accent, undefined);
});

test('transparent accent is ignored', () => {
  assert.equal(toScheme({ accentArgb: 0x000078d4 }).accent, undefined);
  assert.equal(toScheme({ accentArgb: 0xff0078d4 }).accent, '#0078d4');
});

test('override wins, except seed under forced colors', () => {
  const raw: RawReading = { accentArgb: 0xff0078d4, foregroundArgb: BLACK };
  const s = toScheme(raw, { seed: '#ff00ff', mode: 'dark' });
  assert.equal(s.accent, '#ff00ff');
  assert.equal(s.mode, 'dark');
  const hc = toScheme({ ...raw, highContrast: true }, { seed: '#ff00ff' });
  assert.equal(hc.accent, '#0078d4');
  assert.equal(hc.forcedColors, true);
  assert.equal(hc.contrast, 'high');
});

test('provider emits once per real change, debounced', () => {
  const f = fakeBridge({ accentArgb: 0xff0078d4, foregroundArgb: BLACK });
  const timers: Array<() => void> = [];
  const p = createWindowsProvider({
    bridge: f.bridge,
    setTimeoutFn: (fn) => { timers.push(fn); return timers.length - 1; },
    clearTimeoutFn: (h) => { timers[h as number] = () => {}; },
  });
  const seen: string[] = [];
  const off = p.onChange((s) => seen.push(`${s.mode}:${s.accent}`));
  f.set({ accentArgb: 0xffff0000, foregroundArgb: BLACK });
  f.set({ accentArgb: 0xffff0000, foregroundArgb: WHITE }); // burst: only the last should flush
  timers.forEach((t) => t());
  assert.deepEqual(seen, ['dark:#ff0000']);
  f.set({ accentArgb: 0xffff0000, foregroundArgb: WHITE }); // no real change
  timers.forEach((t) => t());
  assert.equal(seen.length, 1);
  off();
  assert.equal(f.subscribed(), false);
});

test('bridge that throws degrades to fallback', () => {
  const p = createWindowsProvider({ bridge: { read: () => { throw new Error('boom'); }, subscribe: () => () => {} } });
  assert.equal(p.getScheme().source, 'fallback');
});
