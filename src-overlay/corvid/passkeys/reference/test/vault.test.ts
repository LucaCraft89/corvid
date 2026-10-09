import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vault, VaultError } from '../vault.ts';
import type { Keyring, Credential } from '../vault.ts';

const FAST = { m: 8 * 1024, t: 2, p: 1 }; // test-only floor params
const cred = (id: string): Credential => ({
  id, rpId: 'example.com', userHandle: 'dXNlcg', userName: 'u', displayName: 'U', alg: -7,
  privateKey: 'SECRET-PRIVATE-KEY-MARKER-' + id, signCount: 0, createdAt: 1, discoverable: true,
});
const memKeyring = (): Keyring & { s: Uint8Array | null } => ({
  s: null, async get() { return this.s; }, async set(x) { this.s = x; },
});

test('roundtrip persists credentials', async () => {
  const v = await Vault.create({ passphrase: 'correct horse', kdf: FAST });
  v.add(cred('a'));
  const file = v.serialize();
  const w = await Vault.open(file, { passphrase: 'correct horse' });
  assert.equal(w.get('a')?.rpId, 'example.com');
  assert.equal(w.revision, 1);
});

test('file contains no plaintext key material or metadata', async () => {
  const v = await Vault.create({ passphrase: 'pw-plaintext-check', kdf: FAST });
  v.add(cred('a'));
  const file = v.serialize();
  for (const needle of ['SECRET-PRIVATE-KEY-MARKER', 'example.com', 'pw-plaintext-check', 'userName'])
    assert.ok(!file.includes(needle), needle);
  // also not hiding in base64 decode of any field
  const f = JSON.parse(file);
  for (const k of ['wrappedKey', 'body']) {
    const raw = Buffer.from(f[k], 'base64url').toString('latin1');
    assert.ok(!raw.includes('SECRET-PRIVATE-KEY-MARKER') && !raw.includes('example.com'));
  }
});

test('wrong passphrase rejected', async () => {
  const v = await Vault.create({ passphrase: 'right', kdf: FAST });
  const file = v.serialize();
  await assert.rejects(Vault.open(file, { passphrase: 'wrong' }), (e: VaultError) => e.code === 'auth-failed');
  await assert.rejects(Vault.open(file, {}), (e: VaultError) => e.code === 'locked');
});

function flipB64(s: string, idx = 5): string {
  const b = Buffer.from(s, 'base64url'); b[idx] ^= 1; return b.toString('base64url');
}

test('tampering with any field is rejected', async () => {
  const v = await Vault.create({ passphrase: 'pw', kdf: FAST });
  v.add(cred('a'));
  const good = JSON.parse(v.serialize());
  const mutate = (fn: (f: any) => void) => { const f = structuredClone(good); fn(f); return JSON.stringify(f); };
  const cases: Record<string, string> = {
    body: mutate(f => { f.body = flipB64(f.body); }),
    wrappedKey: mutate(f => { f.wrappedKey = flipB64(f.wrappedKey); }),
    bodyNonce: mutate(f => { f.bodyNonce = flipB64(f.bodyNonce, 0); }),
    wrapNonce: mutate(f => { f.wrapNonce = flipB64(f.wrapNonce, 0); }),
    salt: mutate(f => { f.kdf.salt = flipB64(f.kdf.salt, 0); }),
    revision: mutate(f => { f.revision = 99; }),
    kdfT: mutate(f => { f.kdf.t = 3; }),
    mode: mutate(f => { f.mode = 'passphrase+keyring'; }),
  };
  for (const [name, file] of Object.entries(cases)) {
    await assert.rejects(Vault.open(file, { passphrase: 'pw', keyring: memKeyring() }), VaultError, name);
  }
  // truncation and garbage
  await assert.rejects(Vault.open(JSON.stringify(good).slice(0, 50), { passphrase: 'pw' }), (e: VaultError) => e.code === 'bad-format');
  await assert.rejects(Vault.open('{}', { passphrase: 'pw' }), (e: VaultError) => e.code === 'bad-format');
});

test('KDF downgrade via file edit is refused before derivation', async () => {
  const v = await Vault.create({ passphrase: 'pw', kdf: FAST });
  const f = JSON.parse(v.serialize());
  f.kdf.m = 8; f.kdf.t = 1;
  await assert.rejects(Vault.open(JSON.stringify(f), { passphrase: 'pw' }), (e: VaultError) => e.code === 'kdf-too-weak');
  f.kdf.m = 64 * 1024 * 1024; f.kdf.t = 2; // DoS-sized
  await assert.rejects(Vault.open(JSON.stringify(f), { passphrase: 'pw' }), (e: VaultError) => e.code === 'kdf-too-weak');
  await assert.rejects(Vault.create({ passphrase: 'x', kdf: { m: 8, t: 1, p: 1 } }), (e: VaultError) => e.code === 'kdf-too-weak');
});

test('nonces are fresh on every save', async () => {
  const v = await Vault.create({ passphrase: 'pw', kdf: FAST });
  const a = JSON.parse(v.serialize()), b = JSON.parse(v.serialize());
  assert.notEqual(a.bodyNonce, b.bodyNonce);
  assert.notEqual(a.wrapNonce, b.wrapNonce);
  assert.equal(b.revision, 2);
});

test('rolled-back file is detectable via authenticated revision', async () => {
  const v = await Vault.create({ passphrase: 'pw', kdf: FAST });
  v.add(cred('a')); const old = v.serialize();
  v.add(cred('b')); v.serialize();
  const reopened = await Vault.open(old, { passphrase: 'pw' });
  assert.equal(reopened.revision, 1); // caller compares against its stored high-water mark
  assert.equal(reopened.body.revision, 1); // body copy agrees with header
});

test('keyring-only and passphrase+keyring modes', async () => {
  const kr = memKeyring();
  const v = await Vault.create({ mode: 'passphrase+keyring', passphrase: 'pw', keyring: kr, kdf: FAST });
  v.add(cred('a'));
  const file = v.serialize();
  assert.ok(kr.s && kr.s.length === 32);
  await Vault.open(file, { passphrase: 'pw', keyring: kr });
  await assert.rejects(Vault.open(file, { passphrase: 'pw', keyring: memKeyring() }), (e: VaultError) => e.code === 'keyring-missing');
  const other = memKeyring(); other.s = new Uint8Array(32).fill(7);
  await assert.rejects(Vault.open(file, { passphrase: 'pw', keyring: other }), (e: VaultError) => e.code === 'auth-failed');
  await assert.rejects(Vault.open(file, { passphrase: 'wrong', keyring: kr }), (e: VaultError) => e.code === 'auth-failed');

  const kr2 = memKeyring();
  const k = await Vault.create({ mode: 'keyring', keyring: kr2 });
  const kf = k.serialize();
  await Vault.open(kf, { keyring: kr2 });
});

test('lock wipes state; list never exposes private keys', async () => {
  const v = await Vault.create({ passphrase: 'pw', kdf: FAST });
  v.add(cred('a'));
  assert.ok(!JSON.stringify(v.list()).includes('SECRET-PRIVATE-KEY'));
  v.lock();
  assert.throws(() => v.list(), (e: VaultError) => e.code === 'locked');
  assert.throws(() => v.serialize(), (e: VaultError) => e.code === 'locked');
});

test('changePassphrase: old rejected, new accepted, credentials kept', async () => {
  const v = await Vault.create({ passphrase: 'old', kdf: FAST });
  v.add(cred('a'));
  await v.changePassphrase('new', FAST);
  const file = v.serialize();
  await assert.rejects(Vault.open(file, { passphrase: 'old' }), VaultError);
  const w = await Vault.open(file, { passphrase: 'new' });
  assert.ok(w.get('a'));
});

test('rename and delete', async () => {
  const v = await Vault.create({ passphrase: 'pw', kdf: FAST });
  v.add(cred('a')); v.rename('a', 'Work');
  assert.equal(v.list()[0].label, 'Work');
  assert.equal(v.delete('a'), true);
  assert.equal(v.delete('a'), false);
});
