import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import {
  signManifest, verifyManifest, selectUpdate, verifyArtifact, rollbackDecision, compareVersions,
} from './manifest.mjs';

function keypair(keyId) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    keyId,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}
const NOW = new Date('2026-10-09T12:00:00Z');
const artifact = Buffer.from('fake installer bytes');
const basePayload = (over = {}) => ({
  schema: 1, channel: 'stable', sequence: 10,
  issued_at: '2026-10-09T00:00:00Z', expires_at: '2026-10-23T00:00:00Z',
  releases: [{
    version: '0.0.2', platform: 'windows-x64', url: 'https://updates.example/win/Corvid.exe',
    sha256: createHash('sha256').update(artifact).digest('hex'), size: artifact.length,
  }],
  ...over,
});
const state = (over = {}) => ({ now: NOW, lastSequence: 0, channel: 'stable', ...over });
const code = (c) => (e) => e.code === c;

test('valid manifest verifies', () => {
  const k = keypair('k1');
  const env = signManifest(basePayload(), [k]);
  const p = verifyManifest(env, { keys: [k], threshold: 1 }, state());
  assert.equal(p.releases[0].version, '0.0.2');
});

test('tampered payload rejected', () => {
  const k = keypair('k1');
  const env = JSON.parse(signManifest(basePayload(), [k]));
  const tampered = Buffer.from(JSON.stringify(basePayload({ sequence: 11 }))).toString('base64url');
  assert.throws(() => verifyManifest(JSON.stringify({ ...env, payload: tampered }), { keys: [k], threshold: 1 }, state()), code('BAD_SIGNATURE'));
});

test('unknown signer, revoked key, and expired key rejected', () => {
  const k = keypair('k1'), other = keypair('k1');
  const env = signManifest(basePayload(), [other]);
  assert.throws(() => verifyManifest(env, { keys: [k], threshold: 1 }, state()), code('BAD_SIGNATURE'));
  const env2 = signManifest(basePayload(), [k]);
  assert.throws(() => verifyManifest(env2, { keys: [{ ...k, revoked: true }], threshold: 1 }, state()), code('BAD_SIGNATURE'));
  assert.throws(() => verifyManifest(env2, { keys: [{ ...k, notAfter: '2026-01-01T00:00:00Z' }], threshold: 1 }, state()), code('BAD_SIGNATURE'));
});

test('threshold: duplicate signatures from one key count once', () => {
  const k1 = keypair('k1'), k2 = keypair('k2');
  const dup = signManifest(basePayload(), [k1, k1]);
  assert.throws(() => verifyManifest(dup, { keys: [k1, k2], threshold: 2 }, state()), code('BAD_SIGNATURE'));
  const two = signManifest(basePayload(), [k1, k2]);
  assert.ok(verifyManifest(two, { keys: [k1, k2], threshold: 2 }, state()));
});

test('expired (freeze) and future-issued manifests rejected', () => {
  const k = keypair('k1');
  const trust = { keys: [k], threshold: 1 };
  assert.throws(() => verifyManifest(signManifest(basePayload({ expires_at: '2026-10-01T00:00:00Z' }), [k]), trust, state()), code('EXPIRED'));
  assert.throws(() => verifyManifest(signManifest(basePayload({ issued_at: '2026-11-01T00:00:00Z' }), [k]), trust, state()), code('FUTURE_ISSUED'));
});

test('older manifest sequence (replay) rejected; equal accepted', () => {
  const k = keypair('k1');
  const trust = { keys: [k], threshold: 1 };
  const env = signManifest(basePayload({ sequence: 5 }), [k]);
  assert.throws(() => verifyManifest(env, trust, state({ lastSequence: 6 })), code('ROLLBACK_MANIFEST'));
  assert.ok(verifyManifest(env, trust, state({ lastSequence: 5 })));
});

test('wrong channel, bad schema, oversized, garbage rejected', () => {
  const k = keypair('k1');
  const trust = { keys: [k], threshold: 1 };
  assert.throws(() => verifyManifest(signManifest(basePayload({ channel: 'beta' }), [k]), trust, state()), code('WRONG_CHANNEL'));
  assert.throws(() => verifyManifest(signManifest(basePayload({ schema: 2 }), [k]), trust, state()), code('BAD_PAYLOAD'));
  assert.throws(() => verifyManifest('x'.repeat(300000), trust, state()), code('TOO_LARGE'));
  assert.throws(() => verifyManifest('not json', trust, state()), code('BAD_JSON'));
  assert.throws(() => verifyManifest('{}', trust, state()), code('BAD_ENVELOPE'));
});

test('selectUpdate: newer only, no downgrade, same-origin https only', () => {
  const cfg = { serverOrigin: 'https://updates.example', installedVersion: '0.0.1', platform: 'windows-x64', deviceBucket: 50 };
  const p = basePayload();
  assert.equal(selectUpdate(p, cfg).action, 'update');
  assert.equal(selectUpdate(p, { ...cfg, installedVersion: '0.0.2' }).action, 'none');
  assert.equal(selectUpdate(p, { ...cfg, installedVersion: '0.1.0' }).action, 'none');
  assert.equal(selectUpdate(p, { ...cfg, platform: 'windows-arm64' }).action, 'none');
  const http = basePayload(); http.releases[0].url = 'http://updates.example/x.exe';
  assert.throws(() => selectUpdate(http, cfg), code('BAD_URL'));
  const cross = basePayload(); cross.releases[0].url = 'https://evil.example/x.exe';
  assert.throws(() => selectUpdate(cross, cfg), code('BAD_URL'));
  assert.equal(selectUpdate(cross, { ...cfg, allowCrossOrigin: true }).action, 'update');
});

test('selectUpdate: staged rollout and min_from', () => {
  const cfg = { serverOrigin: 'https://updates.example', installedVersion: '0.0.1', platform: 'windows-x64', deviceBucket: 60 };
  const p = basePayload(); p.releases[0].rollout = 50;
  assert.equal(selectUpdate(p, cfg).action, 'none');
  assert.equal(selectUpdate(p, { ...cfg, deviceBucket: 10 }).action, 'update');
  const q = basePayload(); q.releases[0].min_from = '0.0.5';
  assert.match(selectUpdate(q, cfg).reason, /must first update/);
});

test('verifyArtifact checks size and sha256', () => {
  const rel = basePayload().releases[0];
  assert.ok(verifyArtifact(artifact, rel));
  assert.throws(() => verifyArtifact(Buffer.from('fake installer byteZ'), rel), code('HASH_MISMATCH'));
  assert.throws(() => verifyArtifact(Buffer.from('short'), rel), code('SIZE_MISMATCH'));
});

test('rollbackDecision', () => {
  const base = { current: '0.0.2', previous: '0.0.1', healthyConfirmed: false, launchesSinceUpdate: 0, graceLaunches: 3, crashesSinceUpdate: 0 };
  assert.equal(rollbackDecision(base).rollback, false);
  assert.equal(rollbackDecision({ ...base, crashesSinceUpdate: 2 }).rollback, true);
  assert.equal(rollbackDecision({ ...base, launchesSinceUpdate: 3 }).blacklist, '0.0.2');
  assert.equal(rollbackDecision({ ...base, healthyConfirmed: true, crashesSinceUpdate: 5 }).rollback, false);
  assert.equal(rollbackDecision({ ...base, previous: null, crashesSinceUpdate: 5 }).rollback, false);
});

test('compareVersions', () => {
  assert.equal(compareVersions('1.2.3.4', '1.2.3.4'), 0);
  assert.equal(compareVersions('1.10', '1.9.9'), 1);
  assert.equal(compareVersions('0.0.1', '0.0.2'), -1);
});
