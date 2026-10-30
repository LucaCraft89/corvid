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
import { BUILTIN_ENGINES, DEFAULT_ENGINE_ID, isValidEngineUrl, normaliseShortcutUrl, type SearchEngine } from './search.js';

export interface Shortcut {
  name: string;
  url: string;
}

export interface Prefs {
  searchEngine: string;
  customEngines: SearchEngine[];
  themeMode: ThemeMode;
  seed: string;
  contrast: ContrastLevel;
  style: PaletteStyle;
  density: Density;
  shortcuts: Shortcut[];
}

export const DEFAULT_PREFS: Readonly<Prefs> = Object.freeze({
  searchEngine: DEFAULT_ENGINE_ID,
  customEngines: [],
  themeMode: 'auto',
  seed: DEFAULT_SEED,
  contrast: 'standard',
  style: 'tonal',
  density: 'comfortable',
  shortcuts: [],
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
    seed: typeof r['seed'] === 'string' && isHexColor(r['seed']) ? r['seed'] : DEFAULT_SEED,
    contrast: oneOf(r['contrast'], CONTRAST_LEVELS, DEFAULT_PREFS.contrast),
    style: oneOf(r['style'], PALETTE_STYLES, DEFAULT_PREFS.style),
    density: oneOf(r['density'], DENSITIES, DEFAULT_PREFS.density),
    shortcuts,
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
      current = sanitize({ shortcuts: current.shortcuts, customEngines: current.customEngines });
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

/** The store for the current page. */
export function defaultStore(): PrefsStore {
  let storage: KeyValueStorage;
  try {
    storage = window.localStorage;
    storage.getItem(STORAGE_KEY);
  } catch {
    storage = memoryStorage();
  }
  return createLocalStore(storage, window);
}
