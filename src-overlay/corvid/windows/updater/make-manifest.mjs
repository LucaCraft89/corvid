#!/usr/bin/env node
// Build + sign an update manifest for one artifact. Never generates keys: the Ed25519 private key
// (PKCS8 PEM) is supplied by the user via --key. Usage:
//   node make-manifest.mjs --artifact X.exe --version 0.0.2 --base-url https://updates.example/win \
//     --key manifest-key.pem --key-id k1 --out manifest.json [--channel stable] [--sequence N] [--ttl-days 14]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { signManifest } from './manifest.mjs';

const { values: a } = parseArgs({
  options: {
    artifact: { type: 'string' }, version: { type: 'string' }, 'base-url': { type: 'string' },
    key: { type: 'string' }, 'key-id': { type: 'string' }, out: { type: 'string' },
    channel: { type: 'string', default: 'stable' }, sequence: { type: 'string' },
    'ttl-days': { type: 'string', default: '14' }, platform: { type: 'string', default: 'windows-x64' },
  },
});
for (const k of ['artifact', 'version', 'base-url', 'key', 'key-id', 'out']) {
  if (!a[k]) { console.error(`missing --${k}`); process.exit(64); }
}
const bytes = readFileSync(a.artifact);
const now = new Date();
const payload = {
  schema: 1,
  channel: a.channel,
  sequence: a.sequence ? Number(a.sequence) : Math.floor(now.getTime() / 1000),
  issued_at: now.toISOString(),
  expires_at: new Date(now.getTime() + Number(a['ttl-days']) * 86400e3).toISOString(),
  releases: [{
    version: a.version,
    platform: a.platform,
    url: `${a['base-url'].replace(/\/$/, '')}/${encodeURIComponent(basename(a.artifact))}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  }],
};
writeFileSync(a.out, signManifest(payload, [{ keyId: a['key-id'], privateKeyPem: readFileSync(a.key, 'utf8') }]));
console.log(`wrote ${a.out} (sequence ${payload.sequence})`);
