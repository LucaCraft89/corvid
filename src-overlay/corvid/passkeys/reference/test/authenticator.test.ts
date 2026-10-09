import { test } from 'node:test';
import assert from 'node:assert/strict';
import { p256 } from '@noble/curves/nist';
import { sha256 } from '@noble/hashes/sha2';
import { Vault } from '../vault.ts';
import { SoftwareAuthenticator, CtapError, FLAG_UP, FLAG_UV, FLAG_AT } from '../authenticator.ts';

const FAST = { m: 8 * 1024, t: 2, p: 1 };
const allow = { presence: async () => true, verification: async () => true };
const deny = { presence: async () => false, verification: async () => false };
const hash = (s: string) => sha256(new TextEncoder().encode(s));
const cat = (a: Uint8Array, b: Uint8Array) => Uint8Array.from([...a, ...b]);

async function setup(gate = allow) {
  const v = await Vault.create({ passphrase: 'pw', kdf: FAST });
  return { v, a: new SoftwareAuthenticator(v, gate) };
}
const mk = (over: object = {}) => ({
  rpId: 'webauthn.io', clientDataHash: hash('cd1'), userHandle: new Uint8Array([1, 2, 3]), userName: 'alice',
  displayName: 'Alice', pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }], residentKey: true, ...over,
});

function pubFromAuthData(ad: Uint8Array): Uint8Array {
  // rpIdHash32 flags1 count4 aaguid16 len2 id.. cose: a5 01 02 03 26 20 01 21 58 20 X 22 58 20 Y
  const len = (ad[53] << 8) | ad[54];
  const cose = ad.slice(55 + len);
  assert.deepEqual([...cose.slice(0, 10)], [0xa5, 1, 2, 3, 0x26, 0x20, 1, 0x21, 0x58, 0x20]);
  const x = cose.slice(10, 42); assert.deepEqual([...cose.slice(42, 45)], [0x22, 0x58, 0x20]);
  const y = cose.slice(45, 77);
  return Uint8Array.from([4, ...x, ...y]);
}

test('register then authenticate: signature verifies under registered COSE key', async () => {
  const { a } = await setup();
  const r = await a.makeCredential(mk({ userVerification: true }));
  assert.equal(r.authData[32] & (FLAG_UP | FLAG_UV | FLAG_AT), FLAG_UP | FLAG_UV | FLAG_AT);
  assert.deepEqual([...r.authData.slice(0, 32)], [...hash('webauthn.io')]);
  const pub = pubFromAuthData(r.authData);

  const cdh = hash('cd2');
  const g = await a.getAssertion({ rpId: 'webauthn.io', clientDataHash: cdh, allowList: [r.credentialId] });
  assert.ok(p256.verify(g.signature, sha256(cat(g.authData, cdh)), pub));
  assert.equal(new DataView(g.authData.buffer, g.authData.byteOffset).getUint32(33), 1);
  const g2 = await a.getAssertion({ rpId: 'webauthn.io', clientDataHash: cdh, allowList: [r.credentialId] });
  assert.equal(new DataView(g2.authData.buffer, g2.authData.byteOffset).getUint32(33), 2, 'counter increments');
});

test('discoverable credential: empty allowList returns userHandle', async () => {
  const { a } = await setup();
  await a.makeCredential(mk());
  const g = await a.getAssertion({ rpId: 'webauthn.io', clientDataHash: hash('x') });
  assert.deepEqual([...g.userHandle!], [1, 2, 3]);
});

test('non-discoverable credential not returned for empty allowList', async () => {
  const { a } = await setup();
  await a.makeCredential(mk({ residentKey: false }));
  await assert.rejects(a.getAssertion({ rpId: 'webauthn.io', clientDataHash: hash('x') }), (e: CtapError) => e.code === 'NO_CREDENTIALS');
});

test('rpId scoping: other origin gets no credentials', async () => {
  const { a } = await setup();
  await a.makeCredential(mk());
  await assert.rejects(a.getAssertion({ rpId: 'evil.example', clientDataHash: hash('x') }), (e: CtapError) => e.code === 'NO_CREDENTIALS');
});

test('excludeList blocks duplicate registration', async () => {
  const { a } = await setup();
  const r = await a.makeCredential(mk());
  await assert.rejects(a.makeCredential(mk({ excludeList: [r.credentialId] })), (e: CtapError) => e.code === 'CREDENTIAL_EXCLUDED');
});

test('unsupported algorithm and bad hash rejected', async () => {
  const { a } = await setup();
  await assert.rejects(a.makeCredential(mk({ pubKeyCredParams: [{ type: 'public-key', alg: -257 }] })), (e: CtapError) => e.code === 'UNSUPPORTED_ALGORITHM');
  await assert.rejects(a.makeCredential(mk({ clientDataHash: new Uint8Array(5) })), (e: CtapError) => e.code === 'INVALID_PARAMETER');
});

test('user denial aborts and stores nothing', async () => {
  const { a, v } = await setup(deny);
  await assert.rejects(a.makeCredential(mk()), (e: CtapError) => e.code === 'OPERATION_DENIED');
  assert.equal(v.list().length, 0);
});

test('conditional UI picker selects among multiple; invalid pick denied', async () => {
  const { a } = await setup();
  const r1 = await a.makeCredential(mk({ userName: 'a' }));
  const r2 = await a.makeCredential(mk({ userName: 'b', userHandle: new Uint8Array([9]) }));
  const id2 = Buffer.from(r2.credentialId).toString('base64url');
  const g = await a.getAssertion({ rpId: 'webauthn.io', clientDataHash: hash('x'), pickCredential: async c => { assert.equal(c.length, 2); assert.ok(!('privateKey' in c[0])); return id2; } });
  assert.deepEqual([...g.credentialId], [...r2.credentialId]);
  assert.notDeepEqual([...g.credentialId], [...r1.credentialId]);
  await assert.rejects(a.getAssertion({ rpId: 'webauthn.io', clientDataHash: hash('x'), pickCredential: async () => 'nope' }), (e: CtapError) => e.code === 'OPERATION_DENIED');
});

test('credentials survive vault serialize/open and still sign', async () => {
  const { a, v } = await setup();
  const r = await a.makeCredential(mk());
  const pub = pubFromAuthData(r.authData);
  const v2 = await Vault.open(v.serialize(), { passphrase: 'pw' });
  const a2 = new SoftwareAuthenticator(v2, allow);
  const cdh = hash('later');
  const g = await a2.getAssertion({ rpId: 'webauthn.io', clientDataHash: cdh });
  assert.ok(p256.verify(g.signature, sha256(cat(g.authData, cdh)), pub));
});
