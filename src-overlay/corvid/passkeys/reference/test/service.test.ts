import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VaultService } from '../service.ts';
import type { VaultStorage } from '../service.ts';
import { SoftwareAuthenticator } from '../authenticator.ts';
import { VaultError } from '../vault.ts';
import { sha256 } from '@noble/hashes/sha2';

const FAST = { m: 8 * 1024, t: 2, p: 1 };
const mem = (): VaultStorage & { data: string | null; hw: number } => ({
  data: null, hw: 0, read() { return this.data; }, write(d) { this.data = d; }, readHighWater() { return this.hw; }, writeHighWater(n) { this.hw = n; },
});
const gate = { presence: async () => true, verification: async () => true };
const reg = (svc: VaultService, rp = 'a.example') => new SoftwareAuthenticator(svc.core, gate).makeCredential({
  rpId: rp, clientDataHash: sha256(new Uint8Array(1)), userHandle: new Uint8Array([1]), userName: 'u', displayName: 'U',
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }], residentKey: true });

test('create, register, persist, relock, unlock', async () => {
  const st = mem(); const s = new VaultService(st, { idleMs: 0 });
  await s.create('long enough passphrase', { kdf: FAST });
  await reg(s); s.persist();
  s.lock();
  assert.throws(() => s.list(), (e: VaultError) => e.code === 'locked');
  const s2 = new VaultService(st, { idleMs: 0 });
  await s2.unlock('long enough passphrase');
  assert.equal(s2.list().length, 1);
  assert.ok(!JSON.stringify(s2.list()).includes('privateKey'));
});

test('on-disk file is ciphertext only', async () => {
  const st = mem(); const s = new VaultService(st, { idleMs: 0 });
  await s.create('another long passphrase', { kdf: FAST });
  await reg(s, 'bank.example'); s.persist();
  assert.ok(!st.data!.includes('bank.example'));
  assert.ok(!st.data!.includes('privateKey'));
});

test('rollback to older file is rejected', async () => {
  const st = mem(); const s = new VaultService(st, { idleMs: 0 });
  await s.create('long enough passphrase', { kdf: FAST });
  const old = st.data!;
  await reg(s); s.persist(); s.lock();
  st.data = old; // attacker restores older (valid!) vault
  await assert.rejects(new VaultService(st, { idleMs: 0 }).unlock('long enough passphrase'), (e: VaultError) => e.code === 'auth-failed');
});

test('tampered file rejected at unlock', async () => {
  const st = mem(); const s = new VaultService(st, { idleMs: 0 });
  await s.create('long enough passphrase', { kdf: FAST }); s.lock();
  const f = JSON.parse(st.data!); const b = Buffer.from(f.body, 'base64url'); b[3] ^= 0xff; f.body = b.toString('base64url');
  st.data = JSON.stringify(f);
  await assert.rejects(new VaultService(st, { idleMs: 0 }).unlock('long enough passphrase'), (e: VaultError) => e.code === 'auth-failed');
});

test('auto-lock after idle', async () => {
  const st = mem(); const s = new VaultService(st, { idleMs: 30 });
  await s.create('long enough passphrase', { kdf: FAST });
  assert.ok(s.unlocked);
  await new Promise(r => setTimeout(r, 80));
  assert.ok(!s.unlocked);
});

test('backup export/import merges without overwrite; backup needs its own passphrase', async () => {
  const a = new VaultService(mem(), { idleMs: 0 }); await a.create('passphrase number one', { kdf: FAST });
  await reg(a, 'one.example'); a.persist();
  const backup = a.exportBackup();
  const b = new VaultService(mem(), { idleMs: 0 }); await b.create('passphrase number two', { kdf: FAST });
  await assert.rejects(b.importBackup(backup, 'wrong'), VaultError);
  assert.deepEqual(await b.importBackup(backup, 'passphrase number one'), { added: 1, skipped: 0 });
  assert.deepEqual(await b.importBackup(backup, 'passphrase number one'), { added: 0, skipped: 1 });
  assert.equal(b.list()[0].rpId, 'one.example');
});

test('rename and delete persist', async () => {
  const st = mem(); const s = new VaultService(st, { idleMs: 0 });
  await s.create('long enough passphrase', { kdf: FAST });
  const r = await reg(s); s.persist();
  const id = Buffer.from(r.credentialId).toString('base64url');
  s.rename(id, 'Work'); s.lock();
  const s2 = new VaultService(st, { idleMs: 0 }); await s2.unlock('long enough passphrase');
  assert.equal(s2.list()[0].label, 'Work');
  assert.ok(s2.delete(id)); assert.equal(s2.list().length, 0);
});

test('cannot create over an existing vault', async () => {
  const st = mem(); const s = new VaultService(st, { idleMs: 0 });
  await s.create('long enough passphrase', { kdf: FAST });
  await assert.rejects(new VaultService(st, { idleMs: 0 }).create('x'.repeat(20), { kdf: FAST }), VaultError);
});
