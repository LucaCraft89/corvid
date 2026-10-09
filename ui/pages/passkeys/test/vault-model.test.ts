import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VaultModel } from '../vault-model.ts';
import type { VaultBackend } from '../vault-model.ts';
import { VaultService } from '../../../../src-overlay/corvid/passkeys/reference/service.ts';
import type { VaultStorage } from '../../../../src-overlay/corvid/passkeys/reference/service.ts';
import { SoftwareAuthenticator } from '../../../../src-overlay/corvid/passkeys/reference/authenticator.ts';
import { sha256 } from '@noble/hashes/sha2';

const FAST = { m: 8 * 1024, t: 2, p: 1 };
function make() {
  const st: VaultStorage & { data: string | null; hw: number } = {
    data: null, hw: 0, read() { return this.data; }, write(d) { this.data = d; }, readHighWater() { return this.hw; }, writeHighWater(n) { this.hw = n; },
  };
  const svc = new VaultService(st, { idleMs: 0 });
  const be: VaultBackend = {
    exists: () => svc.exists, unlocked: () => svc.unlocked,
    create: p => svc.create(p, { kdf: FAST }), unlock: p => svc.unlock(p), lock: () => svc.lock(),
    list: () => svc.list(), rename: (i, l) => svc.rename(i, l), delete: i => svc.delete(i),
    exportBackup: () => svc.exportBackup(), importBackup: (r, p) => svc.importBackup(r, p),
  };
  return { st, svc, be, model: new VaultModel(be) };
}
const addCred = async (svc: VaultService, rp: string, user: string) => {
  await new SoftwareAuthenticator(svc.core, { presence: async () => true, verification: async () => true }).makeCredential({
    rpId: rp, clientDataHash: sha256(new Uint8Array(1)), userHandle: new Uint8Array([1]), userName: user, displayName: user,
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }], residentKey: true });
  svc.persist();
};

test('screen flow: create -> list -> locked -> list', async () => {
  const { model } = make();
  assert.equal(model.screen, 'create');
  assert.equal(await model.create('short', 'short'), false); assert.match(model.error, /12 characters/);
  assert.equal(await model.create('long enough passphrase', 'different passphrase!'), false); assert.match(model.error, /do not match/);
  assert.equal(await model.create('long enough passphrase', 'long enough passphrase'), true);
  assert.equal(model.screen, 'list');
  model.lock(); assert.equal(model.screen, 'locked'); assert.deepEqual(model.items, []);
  assert.equal(await model.unlock('nope nope nope'), false); assert.match(model.error, /did not unlock/);
  assert.equal(await model.unlock('long enough passphrase'), true); assert.equal(model.error, '');
});

test('tampered vault shows an integrity message path (bad-format) or generic failure, never opens', async () => {
  const { model, st, svc } = make();
  await model.create('long enough passphrase', 'long enough passphrase'); model.lock();
  st.data = '{"v":2}';
  assert.equal(await model.unlock('long enough passphrase'), false); assert.match(model.error, /integrity/);
  st.data = st.data.replace('2', '1'); // still malformed
  assert.equal(await model.unlock('long enough passphrase'), false);
  assert.equal(svc.unlocked, false);
});

test('list shows metadata only, sorted; rename; delete needs confirmation', async () => {
  const { model, svc } = make();
  await model.create('long enough passphrase', 'long enough passphrase');
  await addCred(svc, 'b.example', 'zed'); await addCred(svc, 'a.example', 'amy');
  model.items = svc.list(); // refresh via public op
  model.rename(model.items[0]?.id ?? '', '  Work  ');
  assert.deepEqual(model.sorted().map(c => c.rpId), ['a.example', 'b.example']);
  assert.ok(!JSON.stringify(model.items).includes('privateKey'));
  const id = model.items[0]?.id ?? '';
  assert.equal(model.delete(id, false), false); assert.equal(model.items.length, 2);
  assert.equal(model.delete(id, true), true); assert.equal(model.items.length, 1);
});

test('keyring available: empty passphrase creates a keyring vault (decision 2026-10-09)', async () => {
  const m = make(); let called: unknown = 'unset';
  const be = { ...m.be, keyringAvailable: () => true, create: async (p?: string) => { called = p; } };
  const model = new VaultModel(be);
  assert.equal(await model.create('', ''), true); assert.equal(called, undefined);
  const noKr = make();
  assert.equal(await noKr.model.create('', ''), false, 'without keyring a passphrase is mandatory');
});

test('hybrid warning strings state operator visibility, E2E encryption, and the off-effect', async () => {
  const { catalog } = await import('../../diagnostics/i18n.ts');
  const w = catalog['hybrid.warning.body'];
  for (const needle of ['IP address', 'end-to-end encrypted', 'turn this off']) assert.ok(w?.includes(needle), needle);
});

test('backup import: wrong passphrase gives error, right one merges', async () => {
  const a = make(); await a.model.create('passphrase number one', 'passphrase number one'); await addCred(a.svc, 'x.example', 'u');
  const b = make(); await b.model.create('passphrase number two', 'passphrase number two');
  const raw = a.model.exportBackup();
  assert.equal(await b.model.importBackup(raw, 'bad'), null); assert.ok(b.model.error);
  assert.deepEqual(await b.model.importBackup(raw, 'passphrase number one'), { added: 1, skipped: 0 });
  assert.equal(b.model.items.length, 1);
});
