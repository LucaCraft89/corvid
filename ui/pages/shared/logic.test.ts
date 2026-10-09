import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canProceedUnsafe, classifyError, formatBytes, formatDuration, groupHistory, resolveNewTab, type NtpExtension } from './logic.ts';

test('classifyError maps net errors to kinds and page variants', () => {
  const k = (n: string) => classifyError(n);
  assert.equal(k('net::ERR_INTERNET_DISCONNECTED').page, 'offline');
  assert.equal(k('net::ERR_NAME_NOT_RESOLVED').kind, 'dns');
  assert.equal(k('net::ERR_CONNECTION_REFUSED').kind, 'connection');
  assert.equal(k('net::ERR_CONNECTION_TIMED_OUT').kind, 'timeout');
  assert.equal(k('net::ERR_CERT_AUTHORITY_INVALID').page, 'ssl');
  assert.equal(k('net::ERR_SSL_PROTOCOL_ERROR').kind, 'ssl');
  assert.equal(k('net::ERR_BLOCKED_BY_CLIENT').kind, 'blocked');
  assert.equal(k('net::ERR_TOO_MANY_REDIRECTS').kind, 'redirect');
  assert.equal(k('net::ERR_SOMETHING_NEW').kind, 'generic');
  assert.equal(k('net::ERR_DNS_TIMED_OUT').kind, 'dns');
  for (const e of ['net::ERR_NAME_NOT_RESOLVED', 'net::ERR_SOMETHING_NEW']) {
    const c = k(e);
    assert.match(c.summaryKey, /^error\.summary\./);
    assert.ok(c.hintKeys.length > 0);
  }
});

test('canProceedUnsafe: never for HSTS, revoked or pinned', () => {
  assert.equal(canProceedUnsafe('net::ERR_CERT_AUTHORITY_INVALID', false), true);
  assert.equal(canProceedUnsafe('net::ERR_CERT_AUTHORITY_INVALID', true), false);
  assert.equal(canProceedUnsafe('net::ERR_CERT_REVOKED', false), false);
  assert.equal(canProceedUnsafe('net::ERR_CERT_PINNED_KEY_NOT_IN_CERT_CHAIN', false), false);
  assert.equal(canProceedUnsafe('net::ERR_NAME_NOT_RESOLVED', false), false);
});

test('groupHistory groups by local day, sorts, filters', () => {
  const now = new Date(2026, 9, 9, 15, 0).getTime();
  const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
  const v = [
    { id: '1', url: 'https://a.test/', title: 'Alpha', time: at(9, 8) },
    { id: '2', url: 'https://b.test/', title: 'Beta', time: at(9, 12) },
    { id: '3', url: 'https://c.test/', title: 'Gamma', time: at(8, 23) },
    { id: '4', url: 'https://d.test/', title: 'Delta', time: at(1, 1) },
  ];
  const g = groupHistory(v, now);
  assert.deepEqual(g.map((x) => x.visits.map((y) => y.id)), [['2', '1'], ['3'], ['4']]);
  assert.deepEqual(g[0]!.label, { key: 'history.today' });
  assert.deepEqual(g[1]!.label, { key: 'history.yesterday' });
  assert.ok('date' in g[2]!.label);
  assert.deepEqual(groupHistory(v, now, 'gamma').map((x) => x.visits[0]!.id), ['3']);
  assert.deepEqual(groupHistory([], now), []);
});

test('format helpers', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(5 * 1024 ** 3), '5.0 GB');
  assert.equal(formatBytes(-1), '-');
  assert.equal(formatDuration(59), '59s');
  assert.equal(formatDuration(61), '1m 1s');
  assert.equal(formatDuration(3700), '1h 1m');
});

const ext = (id: string, enabledAt: number, o: Partial<NtpExtension> = {}): NtpExtension => ({ id, name: id, enabledAt, overridesNewtab: true, incognitoAllowed: false, ...o });

test('resolveNewTab: default, latest wins, picker, ?default, incognito, disabled', () => {
  const none = { extensions: [], incognito: false, forceDefault: false };
  assert.deepEqual(resolveNewTab(none), { kind: 'corvid' });
  const two = [ext('a', 100), ext('b', 200), ext('c', 300, { overridesNewtab: false })];
  assert.deepEqual(resolveNewTab({ ...none, extensions: two }), { kind: 'extension', id: 'b' }, 'most recently enabled overriding extension');
  assert.deepEqual(resolveNewTab({ ...none, extensions: two, picked: 'a' }), { kind: 'extension', id: 'a' }, 'picker choice');
  assert.deepEqual(resolveNewTab({ ...none, extensions: two, picked: 'corvid' }), { kind: 'corvid' }, 'picker: Corvid default');
  assert.deepEqual(resolveNewTab({ ...none, extensions: two, picked: 'gone' }), { kind: 'extension', id: 'b' }, 'stale pick falls back to latest');
  assert.deepEqual(resolveNewTab({ ...none, extensions: two, forceDefault: true }), { kind: 'corvid' }, '?default escape');
  assert.deepEqual(resolveNewTab({ ...none, extensions: two, incognito: true }), { kind: 'corvid' }, 'incognito not allowed');
  assert.deepEqual(resolveNewTab({ ...none, extensions: [ext('a', 1, { incognitoAllowed: true })], incognito: true }), { kind: 'extension', id: 'a' });
  assert.deepEqual(resolveNewTab({ ...none, extensions: [ext('a', 1)].slice(1) }), { kind: 'corvid' }, 'disabling the extension restores default');
});
