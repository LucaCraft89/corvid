// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Common start-up for every page: strings, icons, theme, live pref updates.

import { applyStrings, t } from '../strings/i18n.js';
import type { StringKey } from '../strings/en.js';
import { applyIcons } from './dom.js';
import { defaultStore, type Prefs, type PrefsStore } from './prefs.js';
import { browserInit, onBrowser, send } from './bridge.js';
import { applyTheme, setSystemAccent } from './theme.js';

export type PageName = 'newtab' | 'settings' | 'error' | 'diagnostics' | 'sync';

/** Host of each page inside the browser (corvid://<host>/). */
export const BROWSER_HOSTS: Record<PageName, string> = {
  newtab: 'newtab',
  settings: 'preferences',
  error: 'error',
  diagnostics: 'diagnostics',
  sync: 'sync',
};

/**
 * Where another Corvid page lives. The dev server serves pages side by side;
 * inside the browser they are corvid://newtab, corvid://preferences, ...
 */
export function pageUrl(name: PageName, hash = ''): string {
  const inBrowser = /^(corvid|chrome):$/.test(location.protocol);
  return (inBrowser ? `${location.protocol}//${BROWSER_HOSTS[name]}/` : `../${name}/`) + hash;
}

export function startPage(titleKey: StringKey, onPrefs?: (p: Prefs) => void): PrefsStore {
  setSystemAccent(browserInit().accent);
  const store = defaultStore();
  document.title = t(titleKey);
  applyStrings();
  applyIcons();
  const update = (p: Prefs) => {
    applyTheme(p);
    onPrefs?.(p);
  };
  update(store.get());
  store.subscribe(update);
  onBrowser('accent', (hex) => {
    setSystemAccent(hex as string | null);
    update(store.get());
  });
  // Lets the browser call back into this page (prefs and accent changes).
  send('corvidReady');
  return store;
}
