// Reference implementation of Corvid update-manifest verification (docs/specs/updater.md).
// This is the TESTED SPEC for the C++ updater; the C++ port must match its test vectors.
// Runs on Node >= 20 (node:crypto Ed25519). No third-party dependencies.
import { createHash, createPublicKey, createPrivateKey, sign as edSign, verify as edVerify } from 'node:crypto';

export const SCHEMA = 1;
export const MAX_ENVELOPE_BYTES = 256 * 1024;

export class ManifestError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

const b64u = {
  enc: (buf) => Buffer.from(buf).toString('base64url'),
  dec: (s) => {
    if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new ManifestError('BAD_ENCODING', 'not base64url');
    return Buffer.from(s, 'base64url');
  },
};

// ---- Semver-ish version compare: dotted numeric (Chromium style 1.2.3.4). ----
export function parseVersion(v) {
  if (typeof v !== 'string' || !/^\d+(\.\d+){1,3}$/.test(v)) throw new ManifestError('BAD_VERSION', `invalid version ${JSON.stringify(v)}`);
  const parts = v.split('.').map(Number);
  while (parts.length < 4) parts.push(0);
  return parts;
}
export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

// ---- Signing (used by make-manifest.mjs and tests). ----
export function signManifest(payloadObj, signers) {
  // signers: [{keyId, privateKeyPem}]. Signature covers the exact payload bytes (no re-canonicalization).
  const payloadBytes = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const signatures = signers.map(({ keyId, privateKeyPem }) => ({
    keyid: keyId,
    sig: b64u.enc(edSign(null, domainSeparated(payloadBytes), createPrivateKey(privateKeyPem))),
  }));
  return JSON.stringify({ payload: b64u.enc(payloadBytes), signatures });
}

function domainSeparated(payloadBytes) {
  // Prevents cross-protocol signature reuse.
  return Buffer.concat([Buffer.from('corvid-update-manifest-v1\0', 'utf8'), payloadBytes]);
}

/**
 * Verify an envelope against a trusted keyring and return the validated payload.
 *
 * trust = {
 *   keys: [{keyId, publicKeyPem, notAfter?: ISO, revoked?: bool}],
 *   threshold: number (>=1, distinct valid keys required),
 * }
 * state = { now: Date, lastSequence: number, channel: string, platform: string }
 */
export function verifyManifest(envelopeText, trust, state) {
  if (typeof envelopeText !== 'string' || Buffer.byteLength(envelopeText) > MAX_ENVELOPE_BYTES) {
    throw new ManifestError('TOO_LARGE', 'envelope missing or too large');
  }
  let env;
  try { env = JSON.parse(envelopeText); } catch { throw new ManifestError('BAD_JSON', 'envelope is not JSON'); }
  if (!env || typeof env.payload !== 'string' || !Array.isArray(env.signatures)) {
    throw new ManifestError('BAD_ENVELOPE', 'missing payload/signatures');
  }
  const payloadBytes = b64u.dec(env.payload);
  const threshold = Number.isInteger(trust.threshold) && trust.threshold >= 1 ? trust.threshold : 1;

  const valid = new Set();
  for (const s of env.signatures) {
    if (!s || typeof s.keyid !== 'string' || typeof s.sig !== 'string') continue;
    const key = trust.keys.find((k) => k.keyId === s.keyid);
    if (!key || key.revoked) continue;
    if (key.notAfter && state.now > new Date(key.notAfter)) continue;
    let ok = false;
    try {
      ok = edVerify(null, domainSeparated(payloadBytes), createPublicKey(key.publicKeyPem), b64u.dec(s.sig));
    } catch { ok = false; }
    if (ok) valid.add(key.keyId); // a Set: duplicate signatures from one key count once
  }
  if (valid.size < threshold) {
    throw new ManifestError('BAD_SIGNATURE', `${valid.size} valid signature(s), ${threshold} required`);
  }

  // Only parse payload AFTER the signature check.
  let p;
  try { p = JSON.parse(payloadBytes.toString('utf8')); } catch { throw new ManifestError('BAD_JSON', 'payload is not JSON'); }
  validatePayloadShape(p);

  if (p.channel !== state.channel) throw new ManifestError('WRONG_CHANNEL', `manifest channel ${p.channel}`);
  const now = state.now;
  if (new Date(p.issued_at) > new Date(now.getTime() + 5 * 60 * 1000)) throw new ManifestError('FUTURE_ISSUED', 'issued_at is in the future');
  if (now > new Date(p.expires_at)) throw new ManifestError('EXPIRED', 'manifest expired (freeze-attack guard)');
  if (p.sequence < state.lastSequence) throw new ManifestError('ROLLBACK_MANIFEST', `sequence ${p.sequence} < last accepted ${state.lastSequence}`);
  return p;
}

function validatePayloadShape(p) {
  const fail = (m) => { throw new ManifestError('BAD_PAYLOAD', m); };
  if (!p || typeof p !== 'object') fail('not an object');
  if (p.schema !== SCHEMA) fail(`unsupported schema ${p.schema}`);
  if (typeof p.channel !== 'string' || !p.channel) fail('channel');
  if (!Number.isSafeInteger(p.sequence) || p.sequence < 0) fail('sequence');
  if (Number.isNaN(Date.parse(p.issued_at)) || Number.isNaN(Date.parse(p.expires_at))) fail('timestamps');
  if (!Array.isArray(p.releases) || p.releases.length === 0 || p.releases.length > 64) fail('releases');
  for (const r of p.releases) {
    parseVersion(r.version);
    if (typeof r.platform !== 'string') fail('platform');
    if (typeof r.url !== 'string') fail('url');
    if (typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.sha256)) fail('sha256 must be 64 lowercase hex');
    if (!Number.isSafeInteger(r.size) || r.size <= 0) fail('size');
    if (r.min_from !== undefined) parseVersion(r.min_from);
    if (r.rollout !== undefined && !(r.rollout >= 0 && r.rollout <= 100)) fail('rollout 0..100');
  }
  if (p.revoked_versions !== undefined) {
    if (!Array.isArray(p.revoked_versions)) fail('revoked_versions');
    p.revoked_versions.forEach(parseVersion);
  }
}

/**
 * Decide whether to update. Pure function.
 * cfg = { serverOrigin: 'https://updates.example', allowCrossOrigin: false, installedVersion, platform, deviceBucket: 0..99 }
 * Returns { action: 'none'|'update', release?, reason? }
 */
export function selectUpdate(payload, cfg) {
  const rel = payload.releases
    .filter((r) => r.platform === cfg.platform)
    .sort((a, b) => compareVersions(b.version, a.version))
    .find((r) => (r.rollout === undefined || cfg.deviceBucket < r.rollout));
  if (!rel) return { action: 'none', reason: 'no matching release' };

  // Downgrade protection: never install <= current.
  if (compareVersions(rel.version, cfg.installedVersion) <= 0) return { action: 'none', reason: 'not newer' };
  if (rel.min_from && compareVersions(cfg.installedVersion, rel.min_from) < 0) {
    return { action: 'none', reason: `must first update to >= ${rel.min_from}` };
  }

  let u;
  try { u = new URL(rel.url); } catch { throw new ManifestError('BAD_URL', 'unparseable url'); }
  if (u.protocol !== 'https:') throw new ManifestError('BAD_URL', 'artifact url must be https');
  if (u.username || u.password) throw new ManifestError('BAD_URL', 'credentials in url');
  if (!cfg.allowCrossOrigin && u.origin !== new URL(cfg.serverOrigin).origin) {
    throw new ManifestError('BAD_URL', 'artifact origin differs from configured update server');
  }
  return { action: 'update', release: rel };
}

/** Verify downloaded artifact bytes against the signed release entry. */
export function verifyArtifact(bytes, release) {
  if (bytes.length !== release.size) throw new ManifestError('SIZE_MISMATCH', `${bytes.length} != ${release.size}`);
  const h = createHash('sha256').update(bytes).digest('hex');
  if (h !== release.sha256) throw new ManifestError('HASH_MISMATCH', 'sha256 differs from signed manifest');
  return true;
}

/**
 * Rollback decision after an update: if the new version failed to reach "healthy"
 * (see spec) within the grace launches, revert to the previous version and blacklist the bad one.
 * st = { current, previous, healthyConfirmed, launchesSinceUpdate, graceLaunches, crashesSinceUpdate }
 */
export function rollbackDecision(st) {
  if (!st.previous) return { rollback: false, reason: 'no previous version kept' };
  if (st.healthyConfirmed) return { rollback: false, reason: 'healthy' };
  if (st.crashesSinceUpdate >= 2 || st.launchesSinceUpdate >= st.graceLaunches) {
    return { rollback: true, reason: 'new version never confirmed healthy', blacklist: st.current };
  }
  return { rollback: false, reason: 'within grace period' };
}
