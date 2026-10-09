import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideHybrid, DEFAULT_HYBRID } from '../hybrid-policy.ts';
import { VaultService } from '../service.ts';
import type { VaultStorage } from '../service.ts';
import type { Keyring } from '../vault.ts';
import { VaultError } from '../vault.ts';

const FAST = { m: 8 * 1024, t: 2, p: 1 };
const mem = (): VaultStorage & { data: string | null } => ({
  data: null, read() { return this.data; }, write(d) { this.data = d; }, readHighWater() { return 0; }, writeHighWater() {},
});
const kr = (): Keyring => { let s: Uint8Array | null = null; return { async get() { return s; }, async set(x) { s = x; } }; };

test('hybrid never allowed at idle (no click)', () => {
  assert.deepEqual(decideHybrid({ enabled: true, warningAcknowledged: true }, { userClickedUsePhone: false }), { allow: false, reason: 'not-user-initiated' });
});
test('hybrid disabled by user wins over everything', () => {
  assert.deepEqual(decideHybrid({ enabled: false, warningAcknowledged: true }, { userClickedUsePhone: true }), { allow: false, reason: 'disabled-by-user' });
});
test('hybrid requires the warning to have been shown and acknowledged', () => {
  assert.deepEqual(decideHybrid(DEFAULT_HYBRID, { userClickedUsePhone: true }), { allow: false, reason: 'warning-required' });
  assert.deepEqual(decideHybrid({ enabled: true, warningAcknowledged: true }, { userClickedUsePhone: true }), { allow: true });
});

test('default unlock mode: keyring when available, passphrase as optional extra, passphrase fallback otherwise', () => {
  assert.equal(VaultService.defaultMode(true, false), 'keyring');
  assert.equal(VaultService.defaultMode(true, true), 'passphrase+keyring');
  assert.equal(VaultService.defaultMode(false, true), 'passphrase');
});

test('with a keyring and no passphrase: keyring-only vault is created and reopens', async () => {
  const st = mem(); const k = kr();
  const s = new VaultService(st, { keyring: k, idleMs: 0 });
  await s.create(undefined, { kdf: FAST });
  assert.equal(JSON.parse(st.data!).mode, 'keyring');
  s.lock();
  await new VaultService(st, { keyring: k, idleMs: 0 }).unlock();
  // keyring wiped/unavailable: cannot open, and the error says why
  await assert.rejects(new VaultService(st, { keyring: kr(), idleMs: 0 }).unlock(), (e: VaultError) => e.code === 'keyring-missing');
});

test('with keyring + passphrase: both are required', async () => {
  const st = mem(); const k = kr();
  const s = new VaultService(st, { keyring: k, idleMs: 0 });
  await s.create('optional extra passphrase', { kdf: FAST });
  assert.equal(JSON.parse(st.data!).mode, 'passphrase+keyring'); s.lock();
  await assert.rejects(new VaultService(st, { keyring: k, idleMs: 0 }).unlock(), (e: VaultError) => e.code === 'locked');
  await new VaultService(st, { keyring: k, idleMs: 0 }).unlock('optional extra passphrase');
});

test('without a keyring and no passphrase: refuses (no unprotected vault)', async () => {
  await assert.rejects(new VaultService(mem(), { idleMs: 0 }).create(undefined, { kdf: FAST }), (e: VaultError) => e.code === 'locked');
});
