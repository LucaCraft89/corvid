// Software WebAuthn authenticator core (CTAP2-shaped) over the encrypted Vault.
// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// Attestation: "none". Algorithm: ES256. Discoverable credentials supported.
// hmac-secret/PRF, EdDSA, RS256: not implemented (documented gap).
import { p256 } from '@noble/curves/nist';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes } from '@noble/hashes/utils';
import { cborEncode } from './cbor.ts';
import type { Credential, Vault } from './vault.ts';

const enc = new TextEncoder();
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

export const FLAG_UP = 0x01, FLAG_UV = 0x04, FLAG_AT = 0x40;
// All-zero AAGUID is the privacy-preserving choice for attestation "none".
export const AAGUID = new Uint8Array(16);

export class CtapError extends Error {
  code: 'NO_CREDENTIALS' | 'CREDENTIAL_EXCLUDED' | 'UNSUPPORTED_ALGORITHM' | 'OPERATION_DENIED' | 'INVALID_PARAMETER';
  constructor(code: CtapError['code'], msg = code) { super(msg); this.code = code; this.name = 'CtapError'; }
}

/** Platform supplies these; deny (return false) on cancel. UV on Linux = vault unlock recency / passphrase. */
export interface UserGate { presence(rpId: string, purpose: 'create' | 'get'): Promise<boolean>; verification(): Promise<boolean> }

export interface MakeCredentialRequest {
  rpId: string; clientDataHash: Uint8Array; userHandle: Uint8Array; userName: string; displayName: string;
  pubKeyCredParams: { type: 'public-key'; alg: number }[];
  excludeList?: Uint8Array[]; residentKey?: boolean; userVerification?: boolean;
}
export interface MakeCredentialResponse { credentialId: Uint8Array; authData: Uint8Array; attObj: Uint8Array }
export interface GetAssertionRequest {
  rpId: string; clientDataHash: Uint8Array; allowList?: Uint8Array[]; userVerification?: boolean;
  /** conditional UI: no prompt, only enumerate; selection comes via pickCredential */
  pickCredential?: (cands: Omit<Credential, 'privateKey'>[]) => Promise<string | null>;
}
export interface GetAssertionResponse { credentialId: Uint8Array; authData: Uint8Array; signature: Uint8Array; userHandle?: Uint8Array }

function u32(n: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b; }
function concat(...p: Uint8Array[]): Uint8Array {
  const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0;
  for (const x of p) { o.set(x, i); i += x.length; }
  return o;
}

function coseEs256(pub: Uint8Array /* 65B uncompressed */): Uint8Array {
  return cborEncode(new Map<number, number | Uint8Array>([
    [1, 2], [3, -7], [-1, 1], [-2, pub.slice(1, 33)], [-3, pub.slice(33, 65)],
  ]));
}

export class SoftwareAuthenticator {
  vault: Vault; gate: UserGate;
  constructor(vault: Vault, gate: UserGate) { this.vault = vault; this.gate = gate; }

  async makeCredential(req: MakeCredentialRequest): Promise<MakeCredentialResponse> {
    if (!req.rpId || req.clientDataHash.length !== 32) throw new CtapError('INVALID_PARAMETER');
    if (!req.pubKeyCredParams.some(p => p.alg === -7 && p.type === 'public-key')) throw new CtapError('UNSUPPORTED_ALGORITHM');
    const existing = this.vault.findByRp(req.rpId);
    for (const ex of req.excludeList ?? []) {
      if (existing.some(c => c.id === b64(ex))) {
        await this.gate.presence(req.rpId, 'create'); // spec: still require touch to avoid leaking existence
        throw new CtapError('CREDENTIAL_EXCLUDED');
      }
    }
    if (!(await this.gate.presence(req.rpId, 'create'))) throw new CtapError('OPERATION_DENIED');
    let flags = FLAG_UP | FLAG_AT;
    if (req.userVerification) {
      if (!(await this.gate.verification())) throw new CtapError('OPERATION_DENIED');
      flags |= FLAG_UV;
    }
    const priv = p256.utils.randomPrivateKey();
    const pub = p256.getPublicKey(priv, false);
    const credId = randomBytes(32);
    const cred: Credential = {
      id: b64(credId), rpId: req.rpId, userHandle: b64(req.userHandle), userName: req.userName,
      displayName: req.displayName, alg: -7, privateKey: b64(priv), signCount: 0,
      createdAt: Date.now(), discoverable: !!req.residentKey,
    };
    this.vault.add(cred);
    const cose = coseEs256(pub);
    const idLen = new Uint8Array([credId.length >> 8, credId.length & 255]);
    const authData = concat(sha256(enc.encode(req.rpId)), new Uint8Array([flags]), u32(0), AAGUID, idLen, credId, cose);
    const attObj = cborEncode(new Map<string, any>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    priv.fill(0);
    return { credentialId: credId, authData, attObj };
  }

  async getAssertion(req: GetAssertionRequest): Promise<GetAssertionResponse> {
    if (!req.rpId || req.clientDataHash.length !== 32) throw new CtapError('INVALID_PARAMETER');
    let cands = this.vault.findByRp(req.rpId);
    if (req.allowList && req.allowList.length) {
      const ids = new Set(req.allowList.map(b64));
      cands = cands.filter(c => ids.has(c.id));
    } else {
      cands = cands.filter(c => c.discoverable);
    }
    if (!cands.length) throw new CtapError('NO_CREDENTIALS');
    let chosen = cands[0];
    if (!chosen) throw new CtapError('NO_CREDENTIALS');
    if (cands.length > 1 || req.pickCredential) {
      const meta = cands.map(({ privateKey: _p, ...r }) => r);
      const id = req.pickCredential ? await req.pickCredential(meta) : chosen.id;
      const found = cands.find(c => c.id === id);
      if (!found) throw new CtapError('OPERATION_DENIED');
      chosen = found;
    }
    if (!(await this.gate.presence(req.rpId, 'get'))) throw new CtapError('OPERATION_DENIED');
    let flags = FLAG_UP;
    if (req.userVerification) {
      if (!(await this.gate.verification())) throw new CtapError('OPERATION_DENIED');
      flags |= FLAG_UV;
    }
    chosen.signCount += 1;
    const authData = concat(sha256(enc.encode(req.rpId)), new Uint8Array([flags]), u32(chosen.signCount));
    const priv = unb64(chosen.privateKey);
    const sig = p256.sign(sha256(concat(authData, req.clientDataHash)), priv).toDERRawBytes();
    priv.fill(0);
    return {
      credentialId: unb64(chosen.id), authData, signature: sig,
      userHandle: cands.length > 1 || !req.allowList?.length ? unb64(chosen.userHandle) : undefined,
    };
  }
}
