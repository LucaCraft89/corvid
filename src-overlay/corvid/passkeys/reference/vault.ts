// Corvid passkey vault: reference implementation of the encrypted credential store.
// Copyright 2026 The Corvid Authors. BSD-3-Clause.
//
// Design (see docs/security/passkeys.md):
//   passphrase --Argon2id--> pk (32B)
//   [optional] keyring secret ks (32B)
//   KEK = HKDF-SHA256(ikm = pk || ks?, salt = kdfSalt, info = "corvid-vault-kek-v1:<mode>")
//   vaultKey (32B random) is wrapped under KEK with XChaCha20-Poly1305
//   body (credential list JSON) is sealed under vaultKey with XChaCha20-Poly1305
//   AAD for both = canonical header bytes, so any header edit (KDF params, mode,
//   version, revision) fails authentication.
// Libraries: @noble/hashes, @noble/ciphers (MIT, independently audited by Cure53).
// No private key or vault key is ever written unencrypted. The caller persists
// serialize() output atomically (write temp + fsync + rename).
import { argon2idAsync } from '@noble/hashes/argon2';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/hashes/utils';

export type UnlockMode = 'passphrase' | 'keyring' | 'passphrase+keyring';

export interface KdfParams { m: number; t: number; p: number } // m in KiB

// Defaults are configurable; OWASP-class interactive baseline. Open question for user.
export const DEFAULT_KDF: KdfParams = { m: 64 * 1024, t: 3, p: 1 };
export const MIN_KDF: KdfParams = { m: 8 * 1024, t: 2, p: 1 }; // floor, rejects downgrade via file edit

export interface Credential {
  id: string;            // base64url credential id
  rpId: string;
  userHandle: string;    // base64url
  userName: string;
  displayName: string;
  alg: -7;               // ES256 (EdDSA/RS256 are follow-ups)
  privateKey: string;    // base64url raw 32B scalar; only ever inside the sealed body
  signCount: number;
  createdAt: number;
  label?: string;
  discoverable: boolean;
}

export interface VaultBody { credentials: Credential[]; revision: number }

export interface Keyring { get(): Promise<Uint8Array | null>; set(secret: Uint8Array): Promise<void> }

export interface VaultFile {
  v: 1;
  mode: UnlockMode;
  kdf: { alg: 'argon2id' } & KdfParams & { salt: string };
  revision: number;      // authenticated monotonic counter (rollback detection by caller)
  wrapNonce: string;
  wrappedKey: string;
  bodyNonce: string;
  body: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export class VaultError extends Error {
  code: 'bad-format' | 'auth-failed' | 'kdf-too-weak' | 'locked' | 'keyring-missing' | 'unsupported';
  constructor(code: VaultError['code'], msg: string) { super(msg); this.code = code; this.name = 'VaultError'; }
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

function headerAad(f: Pick<VaultFile, 'v' | 'mode' | 'kdf' | 'revision'>): Uint8Array {
  // Fixed-order canonical form; independent of JSON key order in the file.
  return enc.encode(JSON.stringify([f.v, f.mode, f.kdf.alg, f.kdf.m, f.kdf.t, f.kdf.p, f.kdf.salt, f.revision]));
}

async function deriveKek(mode: UnlockMode, passphrase: string | undefined, keyringSecret: Uint8Array | null,
                         kdf: KdfParams, salt: Uint8Array): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  if (mode !== 'keyring') {
    if (!passphrase) throw new VaultError('locked', 'passphrase required');
    parts.push(await argon2idAsync(enc.encode(passphrase.normalize('NFKC')), salt,
      { m: kdf.m, t: kdf.t, p: kdf.p, dkLen: 32 }));
  }
  if (mode !== 'passphrase') {
    if (!keyringSecret) throw new VaultError('keyring-missing', 'OS keyring secret unavailable');
    parts.push(keyringSecret);
  }
  const ikm = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { ikm.set(p, o); o += p.length; }
  const kek = hkdf(sha256, ikm, salt, enc.encode('corvid-vault-kek-v1:' + mode), 32);
  ikm.fill(0);
  return kek;
}

function checkKdf(k: KdfParams) {
  if (![k.m, k.t, k.p].every(Number.isInteger) || k.m < MIN_KDF.m || k.t < MIN_KDF.t || k.p < 1 ||
      k.m > 4 * 1024 * 1024 || k.t > 64 || k.p > 16)
    throw new VaultError('kdf-too-weak', 'KDF parameters outside allowed range');
}

export interface CreateOptions { mode?: UnlockMode; passphrase?: string; keyring?: Keyring; kdf?: KdfParams }

export class Vault {
  private vaultKey: Uint8Array | null;
  private file: VaultFile;
  private kek: Uint8Array | null;
  body: VaultBody;

  private constructor(file: VaultFile, vaultKey: Uint8Array, kek: Uint8Array, body: VaultBody) {
    this.file = file; this.vaultKey = vaultKey; this.kek = kek; this.body = body;
  }

  static async create(opts: CreateOptions): Promise<Vault> {
    const mode = opts.mode ?? 'passphrase';
    const kdf = opts.kdf ?? DEFAULT_KDF;
    checkKdf(kdf);
    let ks: Uint8Array | null = null;
    if (mode !== 'passphrase') {
      if (!opts.keyring) throw new VaultError('keyring-missing', 'keyring required for this mode');
      ks = randomBytes(32);
      await opts.keyring.set(ks);
    }
    const salt = randomBytes(16);
    const kek = await deriveKek(mode, opts.passphrase, ks, kdf, salt);
    const file: VaultFile = {
      v: 1, mode, kdf: { alg: 'argon2id', ...kdf, salt: b64(salt) }, revision: 0,
      wrapNonce: '', wrappedKey: '', bodyNonce: '', body: '',
    };
    return new Vault(file, randomBytes(32), kek, { credentials: [], revision: 0 });
  }

  static async open(raw: string | Uint8Array, opts: { passphrase?: string; keyring?: Keyring }): Promise<Vault> {
    let f: VaultFile;
    try { f = JSON.parse(typeof raw === 'string' ? raw : dec.decode(raw)); }
    catch { throw new VaultError('bad-format', 'not JSON'); }
    if (!f || f.v !== 1 || f.kdf?.alg !== 'argon2id' ||
        !['passphrase', 'keyring', 'passphrase+keyring'].includes(f.mode) ||
        typeof f.body !== 'string' || typeof f.wrappedKey !== 'string' || typeof f.kdf.salt !== 'string' ||
        !Number.isInteger(f.revision))
      throw new VaultError('bad-format', 'unsupported or malformed vault');
    checkKdf(f.kdf);
    const ks = f.mode === 'passphrase' ? null : (await opts.keyring?.get()) ?? null;
    const kek = await deriveKek(f.mode, opts.passphrase, ks, f.kdf, unb64(f.kdf.salt));
    const aad = headerAad(f);
    try {
      const vaultKey = xchacha20poly1305(kek, unb64(f.wrapNonce), aad).decrypt(unb64(f.wrappedKey));
      const plain = xchacha20poly1305(vaultKey, unb64(f.bodyNonce), aad).decrypt(unb64(f.body));
      const body = JSON.parse(dec.decode(plain)) as VaultBody;
      plain.fill(0);
      if (!Array.isArray(body.credentials)) throw new Error('shape');
      return new Vault(f, vaultKey, kek, body);
    } catch {
      kek.fill(0);
      // Wrong secret and tampering are deliberately indistinguishable.
      throw new VaultError('auth-failed', 'vault authentication failed (wrong secret or file modified)');
    }
  }

  /** Serialize; bumps the authenticated revision. Fresh nonces on every save. */
  serialize(): string {
    if (!this.vaultKey || !this.kek) throw new VaultError('locked', 'vault is locked');
    const revision = this.file.revision + 1;
    const f: VaultFile = { ...this.file, revision };
    const aad = headerAad(f);
    const wrapNonce = randomBytes(24), bodyNonce = randomBytes(24);
    this.body.revision = revision;
    f.wrapNonce = b64(wrapNonce);
    f.wrappedKey = b64(xchacha20poly1305(this.kek, wrapNonce, aad).encrypt(this.vaultKey));
    f.bodyNonce = b64(bodyNonce);
    f.body = b64(xchacha20poly1305(this.vaultKey, bodyNonce, aad).encrypt(enc.encode(JSON.stringify(this.body))));
    this.file = f;
    return JSON.stringify(f);
  }

  get revision(): number { return this.file.revision; }
  get mode(): UnlockMode { return this.file.mode; }

  /** Re-key under a new passphrase (new salt, new KEK; vault key retained). Call serialize() after. */
  async changePassphrase(newPassphrase: string, kdf: KdfParams = DEFAULT_KDF, keyringSecret?: Uint8Array): Promise<void> {
    if (!this.vaultKey) throw new VaultError('locked', 'vault is locked');
    if (this.file.mode === 'keyring') throw new VaultError('unsupported', 'keyring-only vault has no passphrase');
    checkKdf(kdf);
    const salt = randomBytes(16);
    let ks: Uint8Array | null = null;
    if (this.file.mode === 'passphrase+keyring') {
      if (!keyringSecret) throw new VaultError('keyring-missing', 'keyring secret required');
      ks = keyringSecret;
    }
    const kek = await deriveKek(this.file.mode, newPassphrase, ks, kdf, salt);
    this.kek?.fill(0);
    this.kek = kek;
    this.file = { ...this.file, kdf: { alg: 'argon2id', ...kdf, salt: b64(salt) } };
  }

  lock(): void {
    this.vaultKey?.fill(0); this.kek?.fill(0);
    this.vaultKey = null; this.kek = null;
    this.body = { credentials: [], revision: 0 };
  }
  get locked(): boolean { return this.vaultKey === null; }

  private need() { if (this.locked) throw new VaultError('locked', 'vault is locked'); }
  add(c: Credential) { this.need(); this.body.credentials.push(c); }
  /** Metadata only: never returns private keys (this is what the UI receives). */
  list(): Omit<Credential, 'privateKey'>[] {
    this.need();
    return this.body.credentials.map(({ privateKey: _p, ...rest }) => rest);
  }
  get(id: string): Credential | undefined { this.need(); return this.body.credentials.find(c => c.id === id); }
  findByRp(rpId: string): Credential[] { this.need(); return this.body.credentials.filter(c => c.rpId === rpId); }
  rename(id: string, label: string) {
    const c = this.get(id);
    if (!c) throw new VaultError('bad-format', 'no such credential');
    c.label = label;
  }
  delete(id: string): boolean {
    this.need();
    const n = this.body.credentials.length;
    this.body.credentials = this.body.credentials.filter(c => c.id !== id);
    return this.body.credentials.length < n;
  }
}
