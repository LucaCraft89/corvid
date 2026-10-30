// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Looks up strings in the catalog and fills {placeholders}.
// In Chromium (phase 5) setCatalog() is fed from loadTimeData.

import { en, type StringKey } from './en.js';

declare const __PRODUCT_NAME__: string;

/** From build/branding.conf at build time; the tests define it too. */
export const PRODUCT_NAME: string = typeof __PRODUCT_NAME__ === 'string' ? __PRODUCT_NAME__ : 'Corvid';

let catalog: Record<string, string> = en;

export function setCatalog(strings: Partial<Record<StringKey, string>>): void {
  catalog = { ...en, ...strings };
}

export type Params = Record<string, string | number>;

export function t(key: StringKey, params: Params = {}): string {
  const s = catalog[key] ?? en[key];
  return s.replace(/\{(\w+)\}/g, (m, name: string) => {
    if (name === 'product') return PRODUCT_NAME;
    const v = params[name];
    return v === undefined ? m : String(v);
  });
}

/** Placeholders a string expects, for tests. */
export function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

/**
 * Fills text from the catalog into static markup:
 *   data-i18n="key"              -> textContent
 *   data-i18n-<attr>="key"       -> attribute (aria-label, placeholder, title)
 */
export function applyStrings(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset['i18n'] as StringKey);
  }
  for (const attr of ['aria-label', 'placeholder', 'title']) {
    for (const el of root.querySelectorAll<HTMLElement>(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`) as StringKey));
    }
  }
}
