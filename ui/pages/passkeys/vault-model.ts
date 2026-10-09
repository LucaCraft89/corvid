// Passkey vault page view-model. Pure; talks to a backend port (Mojo in browser, VaultService in tests).
// Copyright 2026 The Corvid Authors. BSD-3-Clause.
import { t } from '../diagnostics/i18n.ts';

export interface PublicCredential { id: string; rpId: string; userName: string; displayName: string; label?: string; createdAt: number; discoverable: boolean }
export interface VaultBackend {
  exists(): boolean; unlocked(): boolean;
  create(passphrase: string): Promise<void>; unlock(passphrase: string): Promise<void>; lock(): void;
  list(): PublicCredential[]; rename(id: string, label: string): void; delete(id: string): boolean;
  exportBackup(): string; importBackup(raw: string, passphrase: string): Promise<{ added: number; skipped: number }>;
}

export type Screen = 'create' | 'locked' | 'list';
export const MIN_PASSPHRASE = 12;

export class VaultModel {
  error = ''; items: PublicCredential[] = [];
  private b: VaultBackend;
  onChange: () => void = () => {};
  constructor(b: VaultBackend) { this.b = b; }

  get screen(): Screen { return !this.b.exists() ? 'create' : this.b.unlocked() ? 'list' : 'locked'; }
  private refresh() { this.items = this.b.unlocked() ? this.b.list() : []; this.onChange(); }

  async create(pass: string, confirm: string): Promise<boolean> {
    this.error = '';
    if (pass.length < MIN_PASSPHRASE) { this.error = t('passkeys.create.short'); this.onChange(); return false; }
    if (pass !== confirm) { this.error = t('passkeys.create.mismatch'); this.onChange(); return false; }
    await this.b.create(pass); this.refresh(); return true;
  }
  async unlock(pass: string): Promise<boolean> {
    this.error = '';
    try { await this.b.unlock(pass); this.refresh(); return true; }
    catch (e: any) {
      // Wrong passphrase and tampering are indistinguishable by design; one message covers both.
      this.error = e?.code === 'bad-format' ? t('passkeys.tampered') : t('passkeys.wrong'); this.onChange(); return false;
    }
  }
  lock() { this.b.lock(); this.items = []; this.error = ''; this.onChange(); }
  rename(id: string, label: string) { this.b.rename(id, label.trim()); this.refresh(); }
  /** Deletion requires the UI to have obtained explicit confirmation; the model enforces it. */
  delete(id: string, confirmed: boolean): boolean {
    if (!confirmed) return false;
    const ok = this.b.delete(id); this.refresh(); return ok;
  }
  exportBackup(): string { return this.b.exportBackup(); }
  async importBackup(raw: string, pass: string) {
    this.error = '';
    try { const r = await this.b.importBackup(raw, pass); this.refresh(); return r; }
    catch (e: any) { this.error = e?.code === 'bad-format' ? t('passkeys.tampered') : t('passkeys.wrong'); this.onChange(); return null; }
  }
  /** Sorted by site then account for stable display. */
  sorted(): PublicCredential[] { return [...this.items].sort((a, b) => a.rpId.localeCompare(b.rpId) || a.userName.localeCompare(b.userName)); }
}
