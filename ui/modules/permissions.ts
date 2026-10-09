// Permission catalog for module API v0. Enforcement point: PermissionBroker.
// In the browser each permission maps to a Mojo capability (src-overlay/corvid/modules/).

export const PERMISSIONS = [
  'tabs.read', 'tabs.manage', 'bookmarks.read', 'bookmarks.manage',
  'storage.local', 'theme.read', 'layout.read', 'layout.write',
  'notifications', 'internal.shell', 'internal.settings', 'internal.extensions',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type Risk = 'low' | 'medium' | 'high';
export interface PermissionInfo {
  id: Permission;
  /** i18n key shown in the consent prompt. */
  descriptionKey: string;
  risk: Risk;
  /** Only kind=builtin modules may declare it. */
  builtinOnly: boolean;
}

export const PERMISSION_INFO: Record<Permission, PermissionInfo> = {
  'tabs.read': { id: 'tabs.read', descriptionKey: 'permission.tabs.read', risk: 'medium', builtinOnly: false },
  'tabs.manage': { id: 'tabs.manage', descriptionKey: 'permission.tabs.manage', risk: 'high', builtinOnly: false },
  'bookmarks.read': { id: 'bookmarks.read', descriptionKey: 'permission.bookmarks.read', risk: 'medium', builtinOnly: false },
  'bookmarks.manage': { id: 'bookmarks.manage', descriptionKey: 'permission.bookmarks.manage', risk: 'high', builtinOnly: false },
  'storage.local': { id: 'storage.local', descriptionKey: 'permission.storage.local', risk: 'low', builtinOnly: false },
  'theme.read': { id: 'theme.read', descriptionKey: 'permission.theme.read', risk: 'low', builtinOnly: false },
  'layout.read': { id: 'layout.read', descriptionKey: 'permission.layout.read', risk: 'low', builtinOnly: false },
  'layout.write': { id: 'layout.write', descriptionKey: 'permission.layout.write', risk: 'medium', builtinOnly: false },
  notifications: { id: 'notifications', descriptionKey: 'permission.notifications', risk: 'low', builtinOnly: false },
  'internal.shell': { id: 'internal.shell', descriptionKey: 'permission.internal', risk: 'high', builtinOnly: true },
  'internal.settings': { id: 'internal.settings', descriptionKey: 'permission.internal', risk: 'high', builtinOnly: true },
  'internal.extensions': { id: 'internal.extensions', descriptionKey: 'permission.internal', risk: 'high', builtinOnly: true },
};

export class PermissionDeniedError extends Error {
  readonly permission: Permission;
  readonly moduleId: string;
  constructor(moduleId: string, permission: Permission) {
    super(`module ${moduleId} lacks permission ${permission}`);
    this.name = 'PermissionDeniedError';
    this.moduleId = moduleId;
    this.permission = permission;
  }
}

/** Holds the granted permission set per module. The only place permissions are checked. */
export class PermissionBroker {
  private granted = new Map<string, Set<Permission>>();

  grant(moduleId: string, perms: Iterable<Permission>): void {
    const set = this.granted.get(moduleId) ?? new Set<Permission>();
    for (const p of perms) set.add(p);
    this.granted.set(moduleId, set);
  }

  revoke(moduleId: string, perm?: Permission): void {
    if (!perm) { this.granted.delete(moduleId); return; }
    this.granted.get(moduleId)?.delete(perm);
  }

  has(moduleId: string, perm: Permission): boolean {
    return this.granted.get(moduleId)?.has(perm) ?? false;
  }

  list(moduleId: string): Permission[] {
    return [...(this.granted.get(moduleId) ?? [])];
  }

  require(moduleId: string, perm: Permission): void {
    if (!this.has(moduleId, perm)) throw new PermissionDeniedError(moduleId, perm);
  }
}
