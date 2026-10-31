// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Where extensions may come from. The browser reads the same settings
// (components/corvid_extensions/sources.cc): keep the field names and the
// built-in update addresses in step with it.

export interface CustomStore {
  name: string;
  /** Update service of the store, https only (same protocol as the Chrome Web Store). */
  updateUrl: string;
}

export interface ExtensionSettings {
  chromeWebStore: boolean;
  edgeAddons: boolean;
  customStores: CustomStore[];
  /** Let uBlock Origin update itself and its filter lists from the network. */
  ublockUpdates: boolean;
}

export const DEFAULT_EXTENSIONS: Readonly<ExtensionSettings> = Object.freeze({
  chromeWebStore: true,
  edgeAddons: true,
  customStores: [],
  ublockUpdates: false,
});

export const CHROME_WEB_STORE_UPDATE_URL = 'https://clients2.google.com/service/update2/crx';
export const EDGE_ADDONS_UPDATE_URL = 'https://edge.microsoft.com/extensionwebstorebase/v1/crx';
const MAX_CUSTOM_STORES = 20;

export function isValidStoreUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname !== '' && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Turns anything into valid settings. Never throws. */
export function sanitizeExtensions(raw: unknown): ExtensionSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const customStores = (Array.isArray(r['customStores']) ? r['customStores'] : [])
    .filter((s): s is CustomStore =>
      !!s && typeof s.name === 'string' && s.name.trim() !== '' && typeof s.updateUrl === 'string' && isValidStoreUrl(s.updateUrl.trim()))
    .map((s) => ({ name: s.name.trim().slice(0, 60), updateUrl: s.updateUrl.trim() }))
    .slice(0, MAX_CUSTOM_STORES);
  return {
    chromeWebStore: bool(r['chromeWebStore'], DEFAULT_EXTENSIONS.chromeWebStore),
    edgeAddons: bool(r['edgeAddons'], DEFAULT_EXTENSIONS.edgeAddons),
    customStores,
    ublockUpdates: bool(r['ublockUpdates'], DEFAULT_EXTENSIONS.ublockUpdates),
  };
}

export interface StoreChoice {
  /** 'chrome', 'edge' or 'custom-<n>' */
  key: string;
  name: string;
  updateUrl: string;
  enabled: boolean;
}

export function storeChoices(s: ExtensionSettings, names: { chrome: string; edge: string }): StoreChoice[] {
  return [
    { key: 'chrome', name: names.chrome, updateUrl: CHROME_WEB_STORE_UPDATE_URL, enabled: s.chromeWebStore },
    { key: 'edge', name: names.edge, updateUrl: EDGE_ADDONS_UPDATE_URL, enabled: s.edgeAddons },
    ...s.customStores.map((c, i) => ({ key: `custom-${i}`, name: c.name, updateUrl: c.updateUrl, enabled: true })),
  ];
}

const ID_RE = /^[a-p]{32}$/;

/**
 * Reads a store link or a bare extension id. Returns the id and, when the
 * link names a known store, that store's key.
 */
export function parseStoreLink(input: string): { id: string; store: 'chrome' | 'edge' | null } | null {
  const text = input.trim();
  if (ID_RE.test(text)) return { id: text, store: null };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  const last = u.pathname.split('/').filter(Boolean).pop() ?? '';
  if (!ID_RE.test(last)) return null;
  if (u.hostname === 'chromewebstore.google.com' || (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore/'))) {
    return { id: last, store: 'chrome' };
  }
  if (u.hostname === 'microsoftedge.microsoft.com' && u.pathname.startsWith('/addons/')) {
    return { id: last, store: 'edge' };
  }
  return { id: last, store: null };
}

/** Address that downloads the extension's package from a store's update service. */
export function storeDownloadUrl(updateUrl: string, id: string, browserVersion: string): string {
  const u = new URL(updateUrl);
  u.searchParams.set('response', 'redirect');
  u.searchParams.set('acceptformat', 'crx3');
  u.searchParams.set('prodversion', browserVersion);
  // Edge's service needs v=; the others ignore it.
  u.searchParams.set('x', `id=${id}&v=0.0.0.0&installsource=ondemand&uc`);
  return u.toString();
}

/** Browser version for store requests, from the user agent ("156.0.0.0" with reduced UA). */
export function browserVersion(ua: string): string {
  return /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? '156.0.0.0';
}
