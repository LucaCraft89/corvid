// Browser-process bridge for corvid://sync. In the browser this is backed by the
// Mojo interface in src-overlay/corvid/sync/webui/sync.mojom, which calls the sync
// engine. Draft: the Mojo binding is not generated/wired yet (no Chromium tree in this
// workspace), so MojoSyncProxy throws and tests use a fake.

export type CollectionId = 'bookmarks' | 'passwords' | 'passkeys' | 'settings' | 'layouts' | 'modules' | 'history' | 'tabs';

export const SYNCABLE: CollectionId[] = ['bookmarks', 'passwords', 'passkeys', 'settings', 'layouts', 'modules'];
export const NOT_YET: CollectionId[] = ['history', 'tabs'];

export interface DeviceRow {
  id: string;
  name: string;
  state: 'approved' | 'pending' | 'revoked';
  fingerprint: string;
  self: boolean;
  lastSeen: number;
}

export interface SyncState {
  signedIn: boolean;
  pendingApproval: boolean;
  serverUrl: string;
  username: string;
  lastSyncMs: number;
  queued: number;
  enabled: Record<string, boolean>;
  integrityErrors: number;
  unavailableModules: string[];
}

export type SyncErrorCode = 'wrong_passphrase' | 'rate_limited' | 'rollback' | 'other';

export class SyncError extends Error {
  constructor(public code: SyncErrorCode, message = '') {
    super(message || code);
  }
}

export interface SyncBrowserProxy {
  getState(): Promise<SyncState>;
  createAccount(a: {serverUrl: string; username: string; passphrase: string; token: string; deviceName: string}): Promise<{recoveryKey: string}>;
  signIn(a: {serverUrl: string; username: string; passphrase: string; deviceName: string}): Promise<void>;
  recover(a: {serverUrl: string; username: string; recoveryKey: string; newPassphrase: string; deviceName: string}): Promise<void>;
  setCollectionEnabled(c: CollectionId, on: boolean): Promise<void>;
  listDevices(): Promise<DeviceRow[]>;
  approveDevice(id: string, fingerprint: string): Promise<void>;
  revokeDevice(id: string, passphrase: string): Promise<void>;
  changePassphrase(oldPass: string, newPass: string): Promise<void>;
  rotateRecoveryKey(): Promise<{recoveryKey: string}>;
  syncNow(): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}

export class MojoSyncProxy implements SyncBrowserProxy {
  private nope(): never {
    throw new Error('corvid://sync Mojo bridge is not wired in this build (draft)');
  }
  getState(): Promise<SyncState> { return this.nope(); }
  createAccount(): Promise<{recoveryKey: string}> { return this.nope(); }
  signIn(): Promise<void> { return this.nope(); }
  recover(): Promise<void> { return this.nope(); }
  setCollectionEnabled(): Promise<void> { return this.nope(); }
  listDevices(): Promise<DeviceRow[]> { return this.nope(); }
  approveDevice(): Promise<void> { return this.nope(); }
  revokeDevice(): Promise<void> { return this.nope(); }
  changePassphrase(): Promise<void> { return this.nope(); }
  rotateRecoveryKey(): Promise<{recoveryKey: string}> { return this.nope(); }
  syncNow(): Promise<void> { return this.nope(); }
  signOut(): Promise<void> { return this.nope(); }
  deleteAccount(): Promise<void> { return this.nope(); }
}
