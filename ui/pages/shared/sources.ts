// Extension sources (CR-2, resolved 2026-10-09). Every source, including the defaults, is user-removable;
// nothing here is hard-coded as permanent. A source is only contacted when the user installs from it or an
// extension installed from it checks for updates; idle Corvid contacts none of them.
//
// Third-party store terms of service may apply to using these stores from a non-native browser; the user
// has accepted that responsibility (docs/extension-sources.md).

export interface ExtensionSource {
  id: string;
  name: string;
  /** Update-check endpoint (Omaha-style "update2/crx" URL), used for extensions installed from this source. */
  updateUrl: string;
  /** Where the user browses/installs from. */
  storeUrl: string;
  enabled: boolean;
  /** Seeded default vs added by the user. Both are removable. */
  origin: 'default' | 'user';
}

export const DEFAULT_SOURCES: readonly ExtensionSource[] = [
  { id: 'chrome-web-store', name: 'Chrome Web Store', updateUrl: 'https://clients2.google.com/service/update2/crx', storeUrl: 'https://chromewebstore.google.com/', enabled: true, origin: 'default' },
  { id: 'edge-addons', name: 'Microsoft Edge Add-ons', updateUrl: 'https://edge.microsoft.com/extensionwebstorebase/v1/crx', storeUrl: 'https://microsoftedge.microsoft.com/addons', enabled: true, origin: 'default' },
];
/** The third default slot: any Chromium-based store URL the user adds. */
export const MANUAL_INSTALL_METHODS = ['crx-file', 'zip-file', 'unpacked-directory'] as const;

export type SourceValidation = { ok: true; source: ExtensionSource } | { ok: false; error: string };

export function validateSource(input: { name: string; updateUrl: string; storeUrl: string }, existing: readonly ExtensionSource[]): SourceValidation {
  const name = input.name.trim();
  if (!name || name.length > 80) return { ok: false, error: 'name must be 1-80 characters' };
  for (const [label, v] of [['updateUrl', input.updateUrl], ['storeUrl', input.storeUrl]] as const) {
    let u: URL;
    try { u = new URL(v); } catch { return { ok: false, error: `${label} is not a valid URL` }; }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return { ok: false, error: `${label} must use https` };
    if (u.username || u.password) return { ok: false, error: `${label} must not contain credentials` };
  }
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source';
  let unique = id;
  for (let n = 2; existing.some((s) => s.id === unique); n++) unique = `${id}-${n}`;
  if (existing.some((s) => s.updateUrl === input.updateUrl)) return { ok: false, error: 'a source with this update URL already exists' };
  return { ok: true, source: { id: unique, name, updateUrl: input.updateUrl, storeUrl: input.storeUrl, enabled: true, origin: 'user' } };
}

export function addSource(list: readonly ExtensionSource[], s: ExtensionSource): ExtensionSource[] { return [...list, s]; }
/** Any source may be removed, including defaults. */
export function removeSource(list: readonly ExtensionSource[], id: string): ExtensionSource[] { return list.filter((s) => s.id !== id); }
export function setSourceEnabled(list: readonly ExtensionSource[], id: string, enabled: boolean): ExtensionSource[] {
  return list.map((s) => (s.id === id ? { ...s, enabled } : s));
}
/** Hosts the user's configured sources may contact; feeds the "user-configured" exemption of the idle check docs. */
export function sourceHosts(list: readonly ExtensionSource[]): string[] {
  return [...new Set(list.filter((s) => s.enabled).flatMap((s) => [new URL(s.updateUrl).hostname]))].sort();
}
