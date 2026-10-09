import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewForEvent, certProblem } from '../error-summary.ts';
import { HubModel, bucketize, groupByTab } from '../hub-model.ts';
import type { DiagnosticsBackend } from '../hub-model.ts';
import { RingBuffer } from '../../../diagnostics/ring-buffer.ts';
import { planExport } from '../../../diagnostics/exporter.ts';
import { catalog } from '../i18n.ts';
import type { DiagEvent, NewEvent, NetErrorData, TlsCert } from '../../../diagnostics/types.ts';

const net = (name: string, code: number, phase: NetErrorData['phase'], extra: Partial<NetErrorData> = {}): NewEvent<'net_error'> => ({
  ts: 1000, tabId: 1, source: 'network', severity: 'error', kind: 'net_error',
  data: { url: 'https://x.example/', errorCode: code, errorName: name, phase, timingsMs: { dns: 12 }, retries: [{ attempt: 1, atMs: 0, errorName: name }], ...extra },
});
const rb = () => new RingBuffer({}, undefined, () => 1000);
const cert = (over: Partial<TlsCert> = {}): TlsCert => ({ subject: 'CN=x.example', issuer: 'CN=Some CA', notBefore: 0, notAfter: 86400000, sha256: 'ab'.repeat(32), ...over });
const tls = (name: string, chain: TlsCert[]): NewEvent<'tls'> => ({
  ts: 1000, tabId: 1, source: 'network', severity: 'error', kind: 'tls', data: { url: 'https://x.example/', errorName: name, chain, hostname: 'x.example' },
});

test('every net error class yields summary, hint and detail', () => {
  const b = rb();
  const cases: NewEvent[] = [
    net('ERR_NAME_NOT_RESOLVED', -105, 'dns', { resolver: { kind: 'system', addresses: [] } }),
    net('ERR_CONNECTION_REFUSED', -102, 'connect'),
    net('ERR_CONNECTION_TIMED_OUT', -118, 'timeout'),
    net('ERR_TOO_MANY_REDIRECTS', -310, 'redirect', { redirectChain: ['https://a/', 'https://b/', 'https://a/'] }),
    tls('ERR_CERT_DATE_INVALID', [cert()]),
    tls('ERR_CERT_AUTHORITY_INVALID', [cert({ issuer: 'CN=x.example' })]),
    tls('ERR_CERT_COMMON_NAME_INVALID', [cert(), cert({ subject: 'CN=Some CA' })]),
  ];
  for (const c of cases) {
    const v = viewForEvent(b.add(c));
    assert.ok(v.summary.length > 10, v.errorName);
    assert.ok(v.hint.length > 5);
    assert.ok(v.detail.length >= 2, v.errorName + ' detail rows');
    assert.ok(v.detail.some(r => r.value.includes(v.errorName) || r.value.includes('sha256')), 'error name or chain shown');
  }
});

test('dns detail shows resolver and timings; retries and redirects listed', () => {
  const b = rb();
  const v = viewForEvent(b.add(net('ERR_NAME_NOT_RESOLVED', -105, 'dns', { resolver: { kind: 'doh', server: 'dns.example' } })));
  const labels = v.detail.map(r => r.label);
  for (const l of ['Resolver', 'Timings (ms)', 'Retry log', 'Error code']) assert.ok(labels.includes(l), l);
  const r = viewForEvent(b.add(net('ERR_TOO_MANY_REDIRECTS', -310, 'redirect', { redirectChain: ['a', 'b'] })));
  assert.ok(r.detail.some(d => d.label === 'Redirect chain' && d.value === 'a -> b'));
});

test('tls: expired, hostname, self-signed are distinguished; chain printed with dates', () => {
  const b = rb();
  assert.ok(viewForEvent(b.add(tls('ERR_CERT_DATE_INVALID', [cert()]))).detail.some(r => r.label === 'Certificate expired'));
  assert.ok(viewForEvent(b.add(tls('ERR_CERT_COMMON_NAME_INVALID', [cert()]))).detail.some(r => r.label === 'Certificate does not match this host'));
  const ss = viewForEvent(b.add(tls('ERR_CERT_AUTHORITY_INVALID', [cert({ issuer: 'CN=x.example' })])));
  assert.ok(ss.detail.some(r => r.label === 'Self-signed certificate'));
  assert.ok(ss.detail.some(r => r.label.startsWith('Certificate chain') && r.value.includes('1970-01-01')));
  assert.equal(certProblem('ERR_FOO'), null);
});

test('hang view shows stack, or says none captured', () => {
  const b = rb();
  const mk = (cap: boolean): NewEvent<'hang'> => ({ ts: 1, source: 'renderer', severity: 'error', kind: 'hang',
    data: { durationMs: 5000, stackCaptured: cap, stack: cap ? [{ fn: 'busyLoop', file: 'app.js', line: 9 }] : [], recovered: false, renderPid: 1 } });
  assert.ok(viewForEvent(b.add(mk(true))).detail[0]?.value.includes('busyLoop (app.js:9)'));
  assert.equal(viewForEvent(b.add(mk(false))).detail[0]?.value, 'No stack could be captured.');
  assert.ok(viewForEvent(b.add(mk(true))).recovery.includes('wait'));
});

test('console kind has no error view', () => {
  const b = rb();
  const e = b.add({ ts: 1, source: 'renderer', severity: 'info', kind: 'console', data: { level: 'info', message: 'x' } });
  assert.throws(() => viewForEvent(e));
});

test('i18n catalog: no empty strings, keys referenced by explain/hint exist for all phases', () => {
  for (const [k, v] of Object.entries(catalog)) assert.ok(v.trim().length > 0, k);
  for (const p of ['dns', 'connect', 'tls', 'http', 'redirect', 'timeout']) { assert.ok(catalog['explain.net.' + p]); assert.ok(catalog['hint.net.' + p]); }
});

test('bucketize and groupByTab', () => {
  const b = rb();
  const e1 = b.add({ ts: 1000, tabId: 1, source: 'renderer', severity: 'warning', kind: 'console', data: { level: 'warning', message: 'a' } });
  const e2 = b.add({ ts: 1500, tabId: 2, source: 'renderer', severity: 'fatal', kind: 'crash', data: { reason: 'x', symbolizedSummary: '', stack: [], uploaded: false } });
  const e3 = b.add({ ts: 2500, tabId: 1, source: 'renderer', severity: 'info', kind: 'console', data: { level: 'info', message: 'c' } });
  const bk = bucketize([e1, e2, e3], 1000, 3000, 1000);
  assert.equal(bk.length, 2);
  assert.deepEqual(bk[0]?.counts, { console: 1, crash: 1 }); assert.equal(bk[0]?.worst, 'fatal');
  assert.equal(bk[1]?.worst, 'info');
  assert.equal(groupByTab([e1, e2, e3]).get(1)!.length, 2);
  assert.deepEqual(bucketize([], 5, 5, 10), []);
  assert.throws(() => bucketize([], 0, 1e9, 1));
});

function fakeBackend(ring: RingBuffer): DiagnosticsBackend & { committed: string[] } {
  const plans = new Map<string, ReturnType<typeof planExport>>();
  return {
    committed: [],
    query: async f => ring.query(f),
    subscribe: cb => ring.subscribe(cb),
    previewExport: async (f, redact) => {
      const plan = planExport({ events: ring.query(f), redact, appVersion: 't' });
      const token = 'tok' + plans.size; plans.set(token, plan); return { preview: plan.preview, token };
    },
    async commitExport(token) { this.committed.push(token); return { ok: plans.has(token), savedPath: '/x' }; },
  };
}

test('hub: live updates respect filter; export flow re-previews on redact toggle', async () => {
  const ring = rb(); const be = fakeBackend(ring);
  const m = new HubModel(be);
  await m.start();
  await m.setFilter({ kinds: ['net_error'] });
  ring.add({ ts: 1, source: 'renderer', severity: 'info', kind: 'console', data: { level: 'info', message: 'ignored' } });
  ring.add(net('ERR_NAME_NOT_RESOLVED', -105, 'dns'));
  assert.equal(m.events.length, 1);
  assert.equal(m.redact, true, 'redaction defaults on');
  const p1 = await m.beginExport();
  assert.equal(p1.redacted, true);
  await m.toggleRedact(false);
  assert.equal(m.exportState!.preview.redacted, false);
  const r = await m.confirmExport();
  assert.ok(r.ok); assert.equal(be.committed.length, 1); assert.equal(m.exportState, null);
  await assert.rejects(m.confirmExport());
  m.stop();
});
