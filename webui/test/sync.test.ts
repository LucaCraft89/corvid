// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceNameProblem, isIntegrityStatus, sanitizeEvent, sanitizeView, serverUrlProblem } from '../src/shared/sync.js';

test('the view from the browser is sanitized', () => {
  const v = sanitizeView({
    mode: 'on', server: 'https://s', deviceName: 'a', joinCode: 'nope',
    pairings: [{ id: 'd1', name: 'n', code: '123456' }, { id: 'd2', name: 'bad', code: '12' }, 'x'],
    devices: [{ id: 'd1', name: 'n', self: true, lastSeen: '17', inRoster: true }, { name: 'no id' }],
    status: { last_success: '1000', generation: '4', last_error: 'network' },
  });
  assert.equal(v.mode, 'on');
  assert.equal(v.joinCode, '');
  assert.deepEqual(v.pairings.map((p) => p.id), ['d1']);
  assert.deepEqual(v.devices, [{ id: 'd1', name: 'n', self: true, lastSeen: 17, inRoster: true }]);
  assert.equal(v.lastSuccess, 1000);
  assert.equal(v.generation, 4);
  assert.equal(v.lastError, 'network');
});

test('garbage gives the off state', () => {
  for (const raw of [null, 3, 'x', [], { mode: 'hacked' }]) {
    const v = sanitizeView(raw);
    assert.equal(v.mode, 'off');
    assert.deepEqual(v.devices, []);
  }
  const e = sanitizeEvent({ recoveryKey: 5, error: 'boom', integrity: 'yes' });
  assert.equal(e.recoveryKey, '');
  assert.equal(e.error, 'boom');
  assert.equal(e.integrity, false);
});

test('server address rule matches the browser', () => {
  assert.equal(serverUrlProblem(''), 'empty');
  assert.equal(serverUrlProblem('nonsense'), 'invalid');
  assert.equal(serverUrlProblem('ftp://x'), 'invalid');
  assert.equal(serverUrlProblem('http://sync.example.org'), 'insecure');
  assert.equal(serverUrlProblem('http://192.168.1.2'), 'insecure');
  assert.equal(serverUrlProblem('https://sync.example.org'), '');
  assert.equal(serverUrlProblem('http://127.0.0.1:8443'), '');
  assert.equal(serverUrlProblem('http://localhost:8443'), '');
});

test('device names and status kinds', () => {
  assert.equal(deviceNameProblem('  '), 'empty');
  assert.equal(deviceNameProblem('x'.repeat(65)), 'long');
  assert.equal(deviceNameProblem('Laptop'), '');
  assert.ok(isIntegrityStatus('rollback'));
  assert.ok(isIntegrityStatus('fork'));
  assert.ok(!isIntegrityStatus('network'));
});
