// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// User preferences shared by the pages. Pages only talk to PrefsStore, so in
// Chromium (phase 5) a store backed by real browser prefs replaces the
// localStorage one used by the dev server.

import {
  CONTRAST_LEVELS, DEFAULT_SEED, PALETTE_STYLES, THEME_MODES,
  type ContrastLevel, type PaletteStyle, type ThemeMode,
} from '../color/engine.js';
import { isHexColor } from '../color/contrast.js';
import { DENSITIES, type Density } from '../tokens/tokens.js';
import { browserInit, inBrowser, onBrowser, send } from './bridge.js';
import { DEFAULT_EXTENSIONS, sanitizeExtensions, type ExtensionSettings } from './extensions.js';
import { BUILTIN_ENGINES, DEFAULT_ENGINE_ID, isValidEngineUrl, normaliseShortcutUrl, type SearchEngine } from './search.js';

export interface Shortcut {
  name: string;
  url: string;
}

export const SEED_SOURCES = ['system', 'custom'] as const;
/** 'system' follows the desktop accent colour when the browser knows one, else uses seed. */
export type SeedSource = (typeof SEED_SOURCES)[number];

export interface Prefs {
  searchEngine: string;
  customEngines: SearchEngine[];
  themeMode: ThemeMode;
  seedSource: SeedSource;
  seed: string;
  contrast: ContrastLevel;
  style: PaletteStyle;
  density: Density;
  shortcuts: Shortcut[];
  /** Extension sources and uBlock Origin updates; read by the browser too. */
  extensions: ExtensionSettings;
}

export const DEFAULT_PREFS: Readonly<Prefs> = Object.freeze({
  searchEngine: DEFAULT_ENGINE_ID,
  customEngines: [],
  themeMode: 'auto',
  seedSource: 'system',
  seed: DEFAULT_SEED,
  contrast: 'standard',
  style: 'tonal',
  density: 'comfortable',
  shortcuts: [],
  extensions: DEFAULT_EXTENSIONS,
});

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/** Turns anything (old or hand-edited data) into valid Prefs. Never throws. */
export function sanitize(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const customEngines = (Array.isArray(r['customEngines']) ? r['customEngines'] : [])
    .filter((e): e is SearchEngine =>
      !!e && typeof e.id === 'string' && typeof e.name === 'string' && e.name.trim() !== '' &&
      typeof e.url === 'string' && isValidEngineUrl(e.url))
    .map((e) => ({ id: e.id, name: e.name.trim(), url: e.url, custom: true }));
  const engineIds = [...BUILTIN_ENGINES, ...customEngines].map((e) => e.id);
  const shortcuts = (Array.isArray(r['shortcuts']) ? r['shortcuts'] : [])
    .filter((s): s is Shortcut => !!s && typeof s.name === 'string' && typeof s.url === 'string')
    .map((s) => ({ name: s.name.trim(), url: normaliseShortcutUrl(s.url) }))
    .filter((s): s is Shortcut => s.url !== null)
    .slice(0, 24);
  return {
    searchEngine: oneOf(r['searchEngine'] as string, engineIds, DEFAULT_ENGINE_ID),
    customEngines,
    themeMode: oneOf(r['themeMode'], THEME_MODES, DEFAULT_PREFS.themeMode),
    seedSource: oneOf(r['seedSource'], SEED_SOURCES, DEFAULT_PREFS.seedSource),
    seed: typeof r['seed'] === 'string' && isHexColor(r['seed']) ? r['seed'] : DEFAULT_SEED,
    contrast: oneOf(r['contrast'], CONTRAST_LEVELS, DEFAULT_PREFS.contrast),
    style: oneOf(r['style'], PALETTE_STYLES, DEFAULT_PREFS.style),
    density: oneOf(r['density'], DENSITIES, DEFAULT_PREFS.density),
    shortcuts,
    extensions: sanitizeExtensions(r['extensions']),
  };
}

export function allEngines(p: Prefs): SearchEngine[] {
  return [...BUILTIN_ENGINES, ...p.customEngines];
}

export function currentEngine(p: Prefs): SearchEngine {
  return allEngines(p).find((e) => e.id === p.searchEngine) ?? BUILTIN_ENGINES[0]!;
}

export interface PrefsStore {
  get(): Prefs;
  set(patch: Partial<Prefs>): Prefs;
  reset(): Prefs;
  /** Called after any change, including changes made in another page. Returns an unsubscribe function. */
  subscribe(fn: (p: Prefs) => void): () => void;
}

/** Minimal storage interface so tests can pass a fake. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'corvid.prefs.v1';

export function createLocalStore(storage: KeyValueStorage, win?: Pick<Window, 'addEventListener'>): PrefsStore {
  const listeners = new Set<(p: Prefs) => void>();
  const read = (): Prefs => {
    try {
      return sanitize(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}'));
    } catch {
      return sanitize({});
    }
  };
  let current = read();
  const emit = () => listeners.forEach((fn) => fn(current));
  win?.addEventListener('storage', (e) => {
    if ((e as StorageEvent).key !== STORAGE_KEY && (e as StorageEvent).key !== null) return;
    current = read();
    emit();
  });
  return {
    get: () => current,
    set(patch) {
      current = sanitize({ ...current, ...patch });
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(current));
      } catch {
        // Storage full or blocked: keep the change for this page only.
      }
      emit();
      return current;
    },
    reset() {
      current = sanitize({ shortcuts: current.shortcuts, customEngines: current.customEngines, extensions: current.extensions });
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(current));
      } catch {
        /* see set() */
      }
      emit();
      return current;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

/**
 * Store backed by the browser's profile prefs. Starts from the prefs the
 * browser put in corvid-init.js, saves through chrome.send, and hears about
 * changes made in any other page of the profile.
 */
export function createBrowserStore(
  initial: unknown,
  save: ((p: Prefs) => void) | null,
  listen: (fn: (raw: unknown) => void) => void,
): PrefsStore {
  const listeners = new Set<(p: Prefs) => void>();
  let current = sanitize(initial);
  const emit = () => listeners.forEach((fn) => fn(current));
  listen((raw) => {
    current = sanitize(raw);
    emit();
  });
  const commit = (next: Prefs) => {
    current = next;
    save?.(current);
    emit();
    return current;
  };
  return {
    get: () => current,
    set: (patch) => commit(sanitize({ ...current, ...patch })),
    reset: () => commit(sanitize({ shortcuts: current.shortcuts, customEngines: current.customEngines, extensions: current.extensions })),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** The store for the current page. */
export function defaultStore(): PrefsStore {
  if (inBrowser()) {
    const init = browserInit();
    return createBrowserStore(
      init.prefs,
      init.readOnly ? null : (p) => send('corvidSetPrefs', JSON.stringify(p)),
      (fn) => onBrowser('prefs', fn),
    );
  }
  let storage: KeyValueStorage;
  try {
    storage = window.localStorage;
    storage.getItem(STORAGE_KEY);
  } catch {
    storage = memoryStorage();
  }
  return createLocalStore(storage, window);
}
