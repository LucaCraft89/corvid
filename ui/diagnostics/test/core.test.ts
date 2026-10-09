import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RingBuffer } from '../ring-buffer.ts';
import type { LineStore } from '../ring-buffer.ts';
import { redactString, redactEvent, REDACT_ALL } from '../redact.ts';
import { planExport, buildBundle } from '../exporter.ts';
import { unzipStore } from '../zip.ts';
import type { NewEvent, DiagEvent } from '../types.ts';

const consoleEv = (ts: number, msg: string, tabId = 1): NewEvent<'console'> => ({
  ts, tabId, source: 'renderer', severity: 'error', kind: 'console',
  data: { level: 'error', message: msg, sourceUrl: 'https://secret.example/app.js?token=abc', line: 3 },
});
const netEv = (ts: number): NewEvent<'net_error'> => ({
  ts, tabId: 2, source: 'network', severity: 'error', kind: 'net_error',
  data: { url: 'https://user:pw@private.example/a?b=c', errorCode: -105, errorName: 'ERR_NAME_NOT_RESOLVED', phase: 'dns',
    timingsMs: { dns: 40 }, retries: [{ attempt: 1, atMs: 0, errorName: 'ERR_NAME_NOT_RESOLVED' }],
    resolver: { kind: 'system', addresses: ['10.1.2.3'] }, redirectChain: ['http://a.example/', 'https://b.example/'] },
});
const memStore = (): LineStore & { lines: string[] } => ({
  lines: [], readAll() { return this.lines; }, replaceAll(l) { this.lines = [...l]; }, append(l) { this.lines.push(l); },
});

test('ring buffer evicts oldest by count', () => {
  const rb = new RingBuffer({ maxEvents: 3 }, undefined, () => 1000);
  for (let i = 0; i < 5; i++) rb.add(consoleEv(1000, 'm' + i));
  assert.deepEqual(rb.query().map(e => (e as any).data.message), ['m2', 'm3', 'm4']);
});

test('ring buffer evicts by bytes and never exceeds cap', () => {
  const rb = new RingBuffer({ maxBytes: 2000 }, undefined, () => 1000);
  for (let i = 0; i < 100; i++) rb.add(consoleEv(1000, 'x'.repeat(100)));
  assert.ok(rb.byteSize <= 2000);
  assert.ok(rb.size > 0);
});

test('ring buffer evicts by age', () => {
  let now = 10_000;
  const rb = new RingBuffer({ maxAgeMs: 1000 }, undefined, () => now);
  rb.add(consoleEv(10_000, 'old')); now = 12_000; rb.add(consoleEv(12_000, 'new'));
  assert.deepEqual(rb.query().map(e => (e as any).data.message), ['new']);
});

test('persistence roundtrip, corrupt lines skipped, ids unique', () => {
  const st = memStore();
  const a = new RingBuffer({}, st, () => 1000);
  a.add(consoleEv(1000, 'one')); a.add(netEv(1001));
  st.lines.push('{"torn":'); st.lines.push('garbage');
  const b = new RingBuffer({}, st, () => 1000);
  assert.equal(b.size, 2); assert.equal(b.dropped, 2);
  const ids = b.query().map(e => e.id); assert.equal(new Set(ids).size, 2);
});

test('persisted store is compacted on eviction', () => {
  const st = memStore();
  const rb = new RingBuffer({ maxEvents: 2 }, st, () => 1000);
  for (let i = 0; i < 6; i++) rb.add(consoleEv(1000, 'm' + i));
  assert.equal(st.lines.length, 2);
});

test('query filters: kind, severity, tab, time, text', () => {
  const rb = new RingBuffer({}, undefined, () => 5000);
  rb.add(consoleEv(1000, 'alpha', 1)); rb.add(netEv(2000)); rb.add({ ...consoleEv(3000, 'beta', 1), severity: 'info' });
  assert.equal(rb.query({ kinds: ['net_error'] }).length, 1);
  assert.equal(rb.query({ minSeverity: 'error' }).length, 2);
  assert.equal(rb.query({ tabId: 2 }).length, 1);
  assert.equal(rb.query({ sinceTs: 2500 }).length, 1);
  assert.equal(rb.query({ text: 'BETA' }).length, 1);
  assert.equal(rb.query({ limit: 1 })[0]?.ts, 3000);
});

test('subscribe gets live events and can unsubscribe', () => {
  const rb = new RingBuffer({}, undefined, () => 1);
  let n = 0; const off = rb.subscribe(() => n++);
  rb.add(consoleEv(1, 'a')); off(); rb.add(consoleEv(1, 'b'));
  assert.equal(n, 1);
});

test('redactString covers urls, paths, ips', () => {
  const s = 'fetch https://a.example/x?y=1 failed at /home/alice/.config/corvid/p and C:\\Users\\bob\\f.txt from 192.168.0.5 and fe80:0:0:0:1:2:3:4';
  const r = redactString(s, REDACT_ALL);
  for (const leak of ['a.example', 'alice', 'bob', '192.168', 'fe80']) assert.ok(!r.includes(leak), leak + ' in ' + r);
  assert.ok(r.includes('[url]') && r.includes('[path]') && r.includes('[ip]'));
});

test('redactEvent removes all url-bearing fields incl. structured ones', () => {
  const rb = new RingBuffer({}, undefined, () => 1000);
  const e = rb.add(netEv(1000));
  const r = JSON.stringify(redactEvent(e, REDACT_ALL));
  for (const leak of ['private.example', 'user:pw', 'a.example', 'b.example', '10.1.2.3']) assert.ok(!r.includes(leak), leak);
  assert.ok(r.includes('ERR_NAME_NOT_RESOLVED'), 'diagnostic value kept');
  assert.ok(JSON.stringify(e).includes('private.example'), 'original not mutated');
});

test('redacting only urls leaves paths', () => {
  const r = redactString('https://x.example/ at /home/a/b', { urls: true, paths: false, ips: false });
  assert.ok(r.includes('/home/a/b') && !r.includes('x.example'));
});

test('export bundle == preview; manifest hashes match; zip valid', () => {
  const rb = new RingBuffer({}, undefined, () => 1000);
  rb.add(consoleEv(1000, 'hello')); rb.add(netEv(1001));
  const dump = new Uint8Array([1, 2, 3, 4]);
  const plan = planExport({ events: rb.query(), redact: false, appVersion: '0.0.0-test', now: 5,
    attachments: [{ name: 'a.dmp', data: dump, kind: 'minidump' }] });
  assert.deepEqual(plan.preview.files.map(f => f.name), ['events.jsonl', 'a.dmp', 'manifest.json']);
  const entries = unzipStore(buildBundle(plan));
  assert.deepEqual(entries.map(e => e.name), plan.preview.files.map(f => f.name));
  const manifest = JSON.parse(new TextDecoder().decode(entries.find(e => e.name === 'manifest.json')!.data));
  assert.equal(manifest.eventCount, 2);
  assert.deepEqual(manifest.files.map((f: any) => f.name), ['events.jsonl', 'a.dmp']);
  assert.equal(entries[0]?.data.length, plan.preview.files[0]?.bytes);
});

test('redaction toggle removes URLs from the bundle and drops minidumps', () => {
  const rb = new RingBuffer({}, undefined, () => 1000);
  rb.add(consoleEv(1000, 'see https://leak.example/p')); rb.add(netEv(1001));
  const att = [{ name: 'a.dmp', data: new Uint8Array([9]), kind: 'minidump' as const }, { name: 'notes.txt', data: new TextEncoder().encode('ok'), kind: 'other' as const }];
  const plan = planExport({ events: rb.query(), redact: true, appVersion: 'v', attachments: att });
  const entries = unzipStore(buildBundle(plan));
  const text = entries.map(e => new TextDecoder().decode(e.data)).join('\n');
  for (const leak of ['leak.example', 'secret.example', 'private.example']) assert.ok(!text.includes(leak), leak);
  assert.ok(!entries.some(e => e.name === 'a.dmp'));
  assert.equal(plan.preview.excluded[0]?.name, 'a.dmp');
  assert.equal(plan.preview.redacted, true);
});

test('bundle build refuses if payload diverges from preview', () => {
  const plan = planExport({ events: [], redact: false, appVersion: 'v' });
  plan.payload.set('events.jsonl', new TextEncoder().encode('tampered\n'));
  assert.throws(() => buildBundle(plan), /diverged/);
  const plan2 = planExport({ events: [], redact: false, appVersion: 'v' });
  plan2.payload.set('extra.txt', new Uint8Array([1]));
  assert.throws(() => buildBundle(plan2), /not in preview/);
});

test('unsafe attachment names (path traversal, reserved) are excluded', () => {
  const plan = planExport({ events: [], redact: false, appVersion: 'v', attachments: [
    { name: '../../etc/passwd', data: new Uint8Array(1), kind: 'other' },
    { name: 'manifest.json', data: new Uint8Array(1), kind: 'other' }] });
  assert.equal(plan.preview.excluded.length, 2);
  assert.equal(plan.preview.files.length, 2);
});

test('exported events are the exact same events listed (count)', () => {
  const rb = new RingBuffer({}, undefined, () => 1000);
  for (let i = 0; i < 10; i++) rb.add(consoleEv(1000, 'm' + i));
  const plan = planExport({ events: rb.query({ limit: 4 }), redact: false, appVersion: 'v' });
  const entries = unzipStore(buildBundle(plan));
  const lines = new TextDecoder().decode(entries[0]?.data).trim().split('\n');
  assert.equal(lines.length, 4); assert.equal(plan.preview.eventCount, 4);
  assert.ok((JSON.parse(lines[0] ?? '') as DiagEvent).id > 0);
});
