// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildErrorView, certReason, detailsText, errorInfoFromQuery, hostOf, kindForCode } from '../src/shared/errors.js';
import { SAMPLES } from '../src/pages/error/samples.js';

test('net error codes map to kinds', () => {
  assert.equal(kindForCode('ERR_NAME_NOT_RESOLVED'), 'dns');
  assert.equal(kindForCode('ERR_INTERNET_DISCONNECTED'), 'offline');
  assert.equal(kindForCode('ERR_CONNECTION_REFUSED'), 'connection');
  assert.equal(kindForCode('ERR_CONNECTION_TIMED_OUT'), 'timeout');
  assert.equal(kindForCode('ERR_CERT_COMMON_NAME_INVALID'), 'ssl');
  assert.equal(kindForCode('ERR_CERT_SOMETHING_NEW'), 'ssl');
  assert.equal(kindForCode('ERR_BLOCKED_BY_CLIENT'), 'blocked');
  assert.equal(kindForCode('ERR_FAILED'), 'generic');
  assert.equal(certReason('ERR_CERT_DATE_INVALID'), 'expired');
  assert.equal(certReason('ERR_CERT_SOMETHING_NEW'), 'other');
});

test('every sample builds a full view with the host in the summary', () => {
  for (const [name, info] of Object.entries(SAMPLES)) {
    const v = buildErrorView(info);
    assert.ok(v.title && !v.title.includes('{'), name);
    assert.ok(v.summary.includes(hostOf(info.url)), name);
    assert.ok(!v.summary.includes('{'), name);
    assert.ok(v.tips.length > 0 && v.tips.every((s) => s.length > 0), name);
    assert.ok(v.details[0]!.rows.some((r) => r.value === info.code), name);
  }
});

test('plain language first: titles have no error codes or jargon', () => {
  for (const info of Object.values(SAMPLES)) {
    const v = buildErrorView(info);
    assert.doesNotMatch(v.title + v.summary, /ERR_|DNS|TLS|SSL|NXDOMAIN|certificate authority/i);
  }
});

test('SSL: reason shown, continue offered only when allowed', () => {
  const v = buildErrorView(SAMPLES['ssl']!);
  assert.equal(v.kind, 'ssl');
  assert.match(v.reason!, /expired/);
  assert.ok(v.canProceed);
  assert.ok(v.details.some((s) => s.rows.some((r) => r.value.startsWith('CN=expired.example.com'))));
  assert.equal(buildErrorView(SAMPLES['ssl-hsts']!).canProceed, false);
  assert.equal(buildErrorView(SAMPLES['dns']!).canProceed, false);
});

test('DNS details, timings and retries are listed', () => {
  const v = buildErrorView(SAMPLES['dns']!);
  const text = detailsText(v);
  assert.match(text, /NXDOMAIN/);
  assert.match(text, /192\.0\.2\.53/);
  assert.match(text, /No answers/);
  assert.match(text, /38 ms/);
  assert.match(text, /14:01:58: ERR_NAME_NOT_RESOLVED/);
});

test('offline retries by itself', () => {
  assert.ok(buildErrorView(SAMPLES['offline']!).autoRetry);
  assert.ok(!buildErrorView(SAMPLES['timeout']!).autoRetry);
});

test('query parsing survives bad input', () => {
  const a = errorInfoFromQuery('?code=ERR_CONNECTION_RESET&url=https%3A%2F%2Fexample.org%2F');
  assert.equal(a.code, 'ERR_CONNECTION_RESET');
  assert.equal(buildErrorView(a).kind, 'connection');
  const b = errorInfoFromQuery('?code=<script>&info=' + encodeURIComponent('{"dns":{"answers":[1,"203.0.113.1"]},"timings":{"dns":"x","tls":5},"certChain":[{"subject":1}],"retries":"no"}'));
  assert.equal(b.code, 'ERR_FAILED');
  assert.deepEqual(b.dns, { answers: ['203.0.113.1'] });
  assert.deepEqual(b.timings, { tls: 5 });
  assert.deepEqual(b.certChain, []);
  assert.equal(b.retries, undefined);
  assert.equal(errorInfoFromQuery('?info=not-json').code, 'ERR_FAILED');
  assert.equal(hostOf('not a url'), 'not a url');
});
