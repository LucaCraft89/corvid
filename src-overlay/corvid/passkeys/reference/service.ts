// Vault service: persistence, lock lifecycle, rollback high-water mark, encrypted backup import/export.
// Copyright 2026 The Corvid Authors. BSD-3-Clause. This is the API surface the passkeys WebUI talks to
// (Mojo in the browser; direct in tests). It never returns private keys.
import { Vault, VaultError } from './vault.ts';
import type { Keyring, KdfParams, UnlockMode } from './vault.ts';

export interface VaultStorage {
  read(): string | null;
  /** Must be atomic (tmp + fsync + rename) in the real implementation. */
  write(data: string): void;
  readHighWater(): number;
  writeHighWater(n: number): void;
}

export interface PublicCredential { id: string; rpId: string; userName: string; displayName: string; label?: string; createdAt: number; discoverable: boolean }

export class VaultService {
  private vault: Vault | null = null;
  private storage: VaultStorage;
  private keyring?: Keyring;
  private idleMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** idleMs: auto-lock after inactivity. 0 disables. Configurable; default is an open question. */
  constructor(storage: VaultStorage, opts: { keyring?: Keyring; idleMs?: number } = {}) {
    this.storage = storage; this.keyring = opts.keyring; this.idleMs = opts.idleMs ?? 5 * 60_000;
  }

  get exists(): boolean { return this.storage.read() !== null; }
  get unlocked(): boolean { return !!this.vault && !this.vault.locked; }

  private touch() {
    if (this.timer) clearTimeout(this.timer);
    if (this.idleMs > 0) { this.timer = setTimeout(() => this.lock(), this.idleMs); (this.timer as any).unref?.(); }
  }
  private save() {
    const v = this.need(); const s = v.serialize();
    this.storage.write(s); this.storage.writeHighWater(v.revision);
  }
  private need(): Vault { if (!this.vault || this.vault.locked) throw new VaultError('locked', 'vault is locked'); this.touch(); return this.vault; }

  /** Decision 2026-10-09: OS keyring is the default unlock secret; passphrase is an optional extra
   *  (passphrase+keyring) or the fallback when no keyring is available. */
  get keyringAvailable(): boolean { return !!this.keyring; }
  static defaultMode(keyring: boolean, hasPassphrase: boolean): UnlockMode {
    return keyring ? (hasPassphrase ? 'passphrase+keyring' : 'keyring') : 'passphrase';
  }

  async create(passphrase?: string, o: { mode?: UnlockMode; kdf?: KdfParams } = {}) {
    if (this.exists) throw new VaultError('unsupported', 'vault already exists');
    const mode = o.mode ?? VaultService.defaultMode(!!this.keyring, !!passphrase);
    this.vault = await Vault.create({ passphrase, mode, kdf: o.kdf, keyring: this.keyring });
    this.save(); this.touch();
  }

  async unlock(passphrase?: string) {
    const raw = this.storage.read();
    if (raw === null) throw new VaultError('bad-format', 'no vault');
    const v = await Vault.open(raw, { passphrase, keyring: this.keyring });
    if (v.revision < this.storage.readHighWater()) {
      v.lock();
      throw new VaultError('auth-failed', 'vault file is older than a previously seen version (rollback)');
    }
    this.vault = v; this.touch();
  }

  lock() { this.vault?.lock(); this.vault = null; if (this.timer) clearTimeout(this.timer); }

  list(): PublicCredential[] { return this.need().list().map(({ id, rpId, userName, displayName, label, createdAt, discoverable }) => ({ id, rpId, userName, displayName, label, createdAt, discoverable })); }
  rename(id: string, label: string) { this.need().rename(id, label.slice(0, 100)); this.save(); }
  delete(id: string): boolean { const ok = this.need().delete(id); if (ok) this.save(); return ok; }
  /** For the authenticator core. */
  get core(): Vault { return this.need(); }
  persist() { this.save(); }

  /** Encrypted backup = current vault file under its own passphrase. No plaintext export path exists. */
  exportBackup(): string { this.need(); return this.storage.read()!; }

  /** Merge credentials from a backup opened with its own passphrase. Existing ids are kept (no overwrite). */
  async importBackup(raw: string, backupPassphrase: string): Promise<{ added: number; skipped: number }> {
    const v = this.need();
    const b = await Vault.open(raw, { passphrase: backupPassphrase });
    let added = 0, skipped = 0;
    for (const c of b.body.credentials) {
      if (v.get(c.id)) { skipped++; continue; }
      v.add({ ...c }); added++;
    }
    b.lock();
    if (added) this.save();
    return { added, skipped };
  }
}
