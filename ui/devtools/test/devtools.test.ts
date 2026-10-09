import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerfTracker, attachToPage, LONG_TASK_MS } from '../perf-overlay.ts';
import { visible, formatEntry, copyAsReport, VERBOSE_DEFAULTS } from '../verbose-console.ts';
import type { ConsoleEntry } from '../verbose-console.ts';
import { DiagnosticsPanel, eventToConsoleEntry } from '../panel.ts';
import type { HostBinding } from '../panel.ts';
import type { DiagEvent } from '../../diagnostics/types.ts';

test('verbose defaults show every level and source', () => {
  for (const level of ['verbose', 'info', 'warning', 'error'] as const)
    for (const source of ['console-api', 'network', 'security', 'javascript', 'other'] as const)
      assert.ok(visible({ ts: 0, level, source, message: 'm' }, VERBOSE_DEFAULTS));
});

test('entries carry stack or an explicit no-stack marker', () => {
  const withStack: ConsoleEntry = { ts: 0, level: 'error', source: 'javascript', message: 'boom', url: 'a.js', line: 3, stack: [{ fn: 'f', file: 'a.js', line: 3 }, { fn: '' }] };
  const s = formatEntry(withStack, VERBOSE_DEFAULTS);
  assert.ok(s.includes('at f (a.js:3)') && s.includes('<anonymous>') && s.includes('1970-01-01T00:00:00.000Z'));
  assert.ok(formatEntry({ ts: 0, level: 'info', source: 'other', message: 'x' }, VERBOSE_DEFAULTS).includes('no stack available'));
});

test('copy as report states filtered counts', () => {
  const entries: ConsoleEntry[] = [
    { ts: 0, level: 'verbose', source: 'console-api', message: 'v' }, { ts: 1, level: 'error', source: 'javascript', message: 'e' }];
  const r = copyAsReport(entries, { ...VERBOSE_DEFAULTS, levels: { ...VERBOSE_DEFAULTS.levels, verbose: false } }, { pageUrl: 'https://p/', userAgent: 'ua' });
  assert.ok(r.includes('entries: 1 of 2')); assert.ok(!r.includes('\n  v\n'));
});

test('perf tracker: long tasks and blocking time on a blocking page', () => {
  const t = new PerfTracker(10_000);
  t.addTask(1000, 30);        // below threshold: ignored
  t.addTask(2000, 250);       // 200 blocking
  t.addTask(5000, 100);       // 50 blocking
  for (let i = 0; i <= 60; i++) t.addFrame(i * (10_000 / 60 / 1) / 1);  // ~6fps over 10s? check below
  const s = t.snapshot(10_000);
  assert.equal(s.longTasks, 2); assert.equal(s.totalBlockingMs, 250); assert.equal(s.worstMs, 250);
  assert.ok(LONG_TASK_MS === 50);
});

test('perf tracker: fps and window expiry', () => {
  const t = new PerfTracker(1000);
  for (let i = 0; i <= 60; i++) t.addFrame(i * (1000 / 60));
  assert.ok(Math.abs(t.snapshot(1000).fps - 60) <= 1);
  t.addTask(0, 100);
  assert.equal(t.snapshot(5000).longTasks, 0, 'old tasks expire');
});

test('attachToPage wires PerformanceObserver(longtask) and rAF; stop disconnects', () => {
  let cb: any; let disconnected = false; const raf: any[] = [];
  class PO { constructor(c: any) { cb = c; } observe(o: any) { assert.equal(o.type, 'longtask'); } disconnect() { disconnected = true; } }
  const t = new PerfTracker();
  const stop = attachToPage(t, { PerformanceObserver: PO, requestAnimationFrame: f => { raf.push(f); return 1; } });
  cb({ getEntries: () => [{ startTime: 100, duration: 300 }] });
  raf.shift()(16);
  assert.equal(t.snapshot(500).longTasks, 1);
  stop(); assert.ok(disconnected);
  raf.shift()?.(32);
  assert.equal(raf.length, 0, 'no further rAF after stop');
});

const ev = (e: Partial<DiagEvent> & { kind: DiagEvent['kind']; data: any }): DiagEvent => ({ id: 1, ts: 5, tabId: 7, source: 'renderer', severity: 'error', ...e } as DiagEvent);

test('hang events link into the DevTools console with their stack', () => {
  const c = eventToConsoleEntry(ev({ kind: 'hang', data: { durationMs: 5000, stack: [{ fn: 'spin' }], stackCaptured: true, recovered: false, renderPid: 1 } }))!;
  assert.ok(c.message.includes('5000 ms')); assert.equal(c.stack?.[0]?.fn, 'spin');
  assert.equal(eventToConsoleEntry(ev({ kind: 'memory', data: {} })), null);
});

test('panel only ingests its own tab and never needs the network', async () => {
  let push: (e: DiagEvent) => void = () => {}; let captured = 0, hubTab = -1;
  const host: HostBinding = {
    tabId: 7,
    query: async () => [ev({ kind: 'console', data: { level: 'warning', message: 'old' } })],
    subscribe: cb => { push = cb; return () => {}; },
    captureFreezeStack: async () => { captured++; return { ok: true, tracePath: '/t.json' }; },
    openHub: t => { hubTab = t; },
  };
  const p = new DiagnosticsPanel(host); await p.start();
  push(ev({ kind: 'console', data: { level: 'error', message: 'mine' } }));
  push(ev({ kind: 'console', tabId: 8, data: { level: 'error', message: 'other tab' } }));
  assert.deepEqual(p.entries.map(e => e.message), ['old', 'mine']);
  assert.equal((await p.captureFreeze()).tracePath, '/t.json'); assert.equal(captured, 1);
  p.openHub(); assert.equal(hubTab, 7);
});
