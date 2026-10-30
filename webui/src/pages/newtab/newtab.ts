// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { t } from '../../strings/i18n.js';
import { $, h, icon } from '../../shared/dom.js';
import { startPage, pageUrl } from '../../shared/page.js';
import { currentEngine, type Prefs, type PrefsStore } from '../../shared/prefs.js';
import { navigationUrl, normaliseShortcutUrl, shortcutMonogram, shortcutTitle } from '../../shared/search.js';

const MAX_SHORTCUTS = 12;

let store: PrefsStore;

function render(p: Prefs): void {
  const q = $<HTMLInputElement>('#q');
  q.placeholder = t('newtab.searchPlaceholder', { engine: currentEngine(p).name });

  const list = $('#tiles');
  list.replaceChildren(
    ...p.shortcuts.map((s, i) =>
      h('li', { class: 'tile' },
        h('a', { href: s.url },
          h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, shortcutMonogram(s)),
          h('span', { class: 'tile-name' }, shortcutTitle(s))),
        (() => {
          const b = h('button', { class: 'icon-button', type: 'button', 'aria-label': t('newtab.shortcutMenu', { name: shortcutTitle(s) }) }, icon('more'));
          b.addEventListener('click', () => openDialog(i));
          return b;
        })()),
    ),
  );
  if (p.shortcuts.length < MAX_SHORTCUTS) {
    const add = h('button', { class: 'tile-add', type: 'button' },
      h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, icon('add')),
      h('span', { class: 'tile-name' }, t('newtab.addShortcut')));
    add.addEventListener('click', () => openDialog(-1));
    list.append(h('li', { class: 'tile' }, add));
  }
}

$<HTMLFormElement>('#search').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = navigationUrl($<HTMLInputElement>('#q').value, currentEngine(store.get()));
  if (url) location.href = url;
});

// Add / edit shortcut dialog
const dialog = $<HTMLDialogElement>('#shortcut-dialog');
const nameIn = $<HTMLInputElement>('#sc-name');
const urlIn = $<HTMLInputElement>('#sc-url');
const urlErr = $('#sc-url-error');
let editing = -1;

function openDialog(index: number): void {
  editing = index;
  const s = store.get().shortcuts[index];
  $('#shortcut-dialog-title').textContent = t(s ? 'newtab.editShortcut' : 'newtab.addShortcut');
  nameIn.value = s?.name ?? '';
  urlIn.value = s?.url ?? '';
  urlIn.removeAttribute('aria-invalid');
  urlErr.textContent = '';
  $('#sc-remove').hidden = !s;
  dialog.showModal();
  (s ? nameIn : urlIn).focus();
}

$('#sc-cancel').addEventListener('click', () => dialog.close());
$('#sc-remove').addEventListener('click', () => {
  store.set({ shortcuts: store.get().shortcuts.filter((_, i) => i !== editing) });
  dialog.close();
});
$<HTMLFormElement>('#shortcut-form').addEventListener('submit', (e) => {
  const url = normaliseShortcutUrl(urlIn.value);
  if (!url) {
    e.preventDefault();
    urlIn.setAttribute('aria-invalid', 'true');
    urlErr.textContent = t('newtab.shortcutUrlInvalid');
    urlIn.focus();
    return;
  }
  const next = [...store.get().shortcuts];
  const item = { name: nameIn.value.trim(), url };
  if (editing >= 0) next[editing] = item;
  else next.push(item);
  store.set({ shortcuts: next });
});

// Last, so every constant above exists before the first render.
store = startPage('newtab.pageTitle', render);
$<HTMLAnchorElement>('#customize').href = pageUrl('settings', '#appearance');
