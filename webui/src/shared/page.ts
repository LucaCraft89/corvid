// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Common start-up for every page: strings, icons, theme, live pref updates.

import { applyStrings, t } from '../strings/i18n.js';
import type { StringKey } from '../strings/en.js';
import { applyIcons } from './dom.js';
import { defaultStore, type Prefs, type PrefsStore } from './prefs.js';
import { applyTheme } from './theme.js';

export type PageName = 'newtab' | 'settings' | 'error';

/**
 * Where another Corvid page lives. The dev server serves pages side by side;
 * inside the browser they are corvid://newtab, corvid://settings, ...
 */
export function pageUrl(name: PageName, hash = ''): string {
  const inBrowser = /^(corvid|chrome):$/.test(location.protocol);
  return (inBrowser ? `${location.protocol}//${name}/` : `../${name}/`) + hash;
}

export function startPage(titleKey: StringKey, onPrefs?: (p: Prefs) => void): PrefsStore {
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
  return store;
}
