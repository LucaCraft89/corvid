// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Search engines and turning what the user typed into a URL.

export interface SearchEngine {
  id: string;
  name: string;
  /** Search URL with %s where the query goes. */
  url: string;
  custom?: boolean;
}

/** Built-in list. DuckDuckGo is the placeholder default (docs/PROJECT.md). */
export const BUILTIN_ENGINES: readonly SearchEngine[] = [
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { id: 'brave', name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  { id: 'startpage', name: 'Startpage', url: 'https://www.startpage.com/do/search?query=%s' },
  { id: 'mojeek', name: 'Mojeek', url: 'https://www.mojeek.com/search?q=%s' },
  { id: 'ecosia', name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
  { id: 'qwant', name: 'Qwant', url: 'https://www.qwant.com/?q=%s' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
];

export const DEFAULT_ENGINE_ID = 'duckduckgo';

/** A custom engine URL must be http(s) and contain %s. */
export function isValidEngineUrl(url: string): boolean {
  if (!url.includes('%s')) return false;
  try {
    const u = new URL(url.replace(/%s/g, 'x'));
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.length > 0;
  } catch {
    return false;
  }
}

export function searchUrl(engine: SearchEngine, query: string): string {
  return engine.url.replace(/%s/g, encodeURIComponent(query.trim()));
}

const SCHEMES = /^(https?|ftp|file|about|data|view-source|chrome|corvid|chrome-extension):/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOSTLIKE = /^(localhost|\[[0-9a-f:]+\]|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,63}|\d{1,3}(\.\d{1,3}){3})(:\d{1,5})?([/?#].*)?$/i;

/**
 * Returns the URL to open for what the user typed: the address itself when
 * it looks like one, otherwise a search with the given engine.
 * Returns null for empty input.
 */
export function navigationUrl(input: string, engine: SearchEngine): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/\s/.test(s)) return searchUrl(engine, s);
  if (SCHEMES.test(s)) return s;
  if (HOSTLIKE.test(s)) {
    const host = s.split(/[/?#:]/)[0]!;
    if (IPV4.test(host) && host.split('.').some((n) => Number(n) > 255)) return searchUrl(engine, s);
    // localhost and plain IPs are usually local servers without TLS.
    const local = /^(localhost|127\.|10\.|192\.168\.|\[)/i.test(s);
    return (local ? 'http://' : 'https://') + s;
  }
  return searchUrl(engine, s);
}

/** Normalises a shortcut address, or returns null if it is not a web address. */
export function normaliseShortcutUrl(input: string): string | null {
  const s = input.trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : HOSTLIKE.test(s) ? 'https://' + s : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    return u.hostname ? u.href : null;
  } catch {
    return null;
  }
}

/** Text shown under a shortcut tile: its name, or the host without www. */
export function shortcutTitle(s: { name: string; url: string }): string {
  return s.name.trim() || new URL(s.url).hostname.replace(/^www\./, '');
}

/** First letter for the tile. No favicons: fetching them would leak. */
export function shortcutMonogram(s: { name: string; url: string }): string {
  return (Array.from(shortcutTitle(s))[0] ?? '?').toLocaleUpperCase();
}
