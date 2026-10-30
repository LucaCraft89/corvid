// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { CONTRAST_LEVELS, DEFAULT_SEED, PALETTE_STYLES, THEME_MODES, makePalette } from '../../color/engine.js';
import { contrastRatio } from '../../color/contrast.js';
import { t } from '../../strings/i18n.js';
import type { StringKey } from '../../strings/en.js';
import { $, h, icon, snackbar } from '../../shared/dom.js';
import { startPage } from '../../shared/page.js';
import { allEngines, type Prefs, type PrefsStore } from '../../shared/prefs.js';
import { isValidEngineUrl } from '../../shared/search.js';
import { themeCss, themeIssueCount } from '../../shared/theme.js';
import { DENSITIES } from '../../tokens/tokens.js';

const PRESETS: [string, StringKey][] = [
  [DEFAULT_SEED, 'settings.theme.preset.indigo'],
  ['#1E6FD9', 'settings.theme.preset.blue'],
  ['#006A6A', 'settings.theme.preset.teal'],
  ['#3F7A3A', 'settings.theme.preset.green'],
  ['#C58A00', 'settings.theme.preset.amber'],
  ['#D2601A', 'settings.theme.preset.orange'],
  ['#B3261E', 'settings.theme.preset.red'],
  ['#C2185B', 'settings.theme.preset.pink'],
  ['#7B4FB0', 'settings.theme.preset.purple'],
];

let current: Prefs;
let store: PrefsStore;

/** Builds or updates a segmented radio group. Only rebuilds when empty so focus is kept. */
function segmented<T extends string>(id: string, values: readonly T[], label: (v: T) => StringKey, value: T, onPick: (v: T) => void): void {
  const box = $(`#${id}`);
  if (!box.childElementCount) {
    for (const v of values) {
      const input = h('input', { type: 'radio', name: id, value: v });
      input.addEventListener('change', () => onPick(v));
      box.append(h('label', {}, input, h('span', {}, t(label(v)))));
    }
  }
  for (const input of box.querySelectorAll<HTMLInputElement>('input')) input.checked = input.value === value;
}

function render(p: Prefs): void {
  renderEngines(p);
  segmented('mode', THEME_MODES, (v) => `settings.theme.mode.${v}` as StringKey, p.themeMode, (v) => save({ themeMode: v }));
  segmented('style', PALETTE_STYLES, (v) => `settings.theme.style.${v}` as StringKey, p.style, (v) => save({ style: v }));
  segmented('contrast', CONTRAST_LEVELS, (v) => `settings.theme.contrast.${v}` as StringKey, p.contrast, (v) => save({ contrast: v }));
  segmented('density', DENSITIES, (v) => `settings.density.${v}` as StringKey, p.density, (v) => save({ density: v }));
  renderSwatches(p);
  renderPreview(p);
}

let savedTimer: ReturnType<typeof setTimeout> | undefined;
function save(patch: Partial<Prefs>): void {
  store.set(patch);
  // One "Saved" message per burst of changes (dragging the colour picker fires many).
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => snackbar(t('settings.saved')), 400);
}

function renderEngines(p: Prefs): void {
  const list = $('#engines');
  list.replaceChildren(
    ...allEngines(p).map((e) => {
      const id = `engine-${e.id}`;
      const input = h('input', { type: 'radio', name: 'engine', id, value: e.id, checked: e.id === p.searchEngine });
      input.addEventListener('change', () => save({ searchEngine: e.id }));
      const row = h('div', { class: 'engine' },
        input,
        h('label', { for: id }, h('span', {}, e.name), h('span', { class: 'host' }, new URL(e.url.replace(/%s/g, '')).hostname)));
      if (e.custom) {
        const rm = h('button', { type: 'button', class: 'icon-button', 'aria-label': t('settings.search.removeEngine', { name: e.name }) }, icon('close'));
        rm.addEventListener('click', () => save({ customEngines: current.customEngines.filter((c) => c.id !== e.id) }));
        row.append(rm);
      }
      return row;
    }),
  );
}

function onColor(hex: string): string {
  // Readable check mark on top of a swatch.
  return contrastRatio('#ffffff', hex) >= contrastRatio('#000000', hex) ? '#ffffff' : '#000000';
}

function renderSwatches(p: Prefs): void {
  const box = $('#swatches');
  if (!box.childElementCount) {
    for (const [hex, key] of PRESETS) {
      const input = h('input', { type: 'radio', name: 'seed', value: hex, 'aria-label': t(key) });
      input.addEventListener('change', () => save({ seed: hex }));
      const span = h('span', { 'aria-hidden': 'true' });
      span.style.setProperty('--swatch', hex);
      span.style.setProperty('--swatch-on', onColor(hex));
      box.append(h('label', { class: 'swatch', title: t(key) }, input, span));
    }
    const picker = h('input', { type: 'color', id: 'custom-color', 'aria-label': t('settings.theme.customColor') });
    picker.addEventListener('input', () => save({ seed: picker.value }));
    box.append(h('label', { class: 'swatch custom', title: t('settings.theme.customColor') }, picker, h('span', { 'aria-hidden': 'true' })));
  }
  const isPreset = PRESETS.some(([hex]) => hex.toLowerCase() === p.seed.toLowerCase());
  for (const input of box.querySelectorAll<HTMLInputElement>('input[type=radio]')) {
    input.checked = input.value.toLowerCase() === p.seed.toLowerCase();
  }
  const custom = box.querySelector<HTMLElement>('.swatch.custom')!;
  const picker = custom.querySelector<HTMLInputElement>('input')!;
  if (document.activeElement !== picker) picker.value = p.seed.length === 7 ? p.seed.toLowerCase() : makePalette({ seed: p.seed, dark: false }).primary;
  custom.classList.toggle('active', !isPreset);
  custom.querySelector('span')!.style.setProperty('--swatch', p.seed);
  picker.setAttribute('aria-label', isPreset ? t('settings.theme.customColor') : t('settings.theme.customColorValue', { color: p.seed.toUpperCase() }));
}

const PREVIEW: [string, string][] = [
  ['primary', 'on-primary'],
  ['primary-container', 'on-primary-container'],
  ['secondary-container', 'on-secondary-container'],
  ['tertiary-container', 'on-tertiary-container'],
  ['surface-container-highest', 'on-surface'],
  ['error-container', 'on-error-container'],
];

function renderPreview(p: Prefs): void {
  const box = $('#preview');
  if (!box.childElementCount) {
    for (const [bg, fg] of PREVIEW) {
      const d = h('div', {}, 'Aa');
      d.style.background = `var(--md-sys-color-${bg})`;
      d.style.color = `var(--md-sys-color-${fg})`;
      box.append(d);
    }
  }
  const issues = themeIssueCount(themeCss(p));
  $('#aa-status').textContent = issues === 0 ? t('settings.theme.aaPass') : t('settings.theme.aaFail', { count: issues });
}

// Custom search engine dialog
const engineDialog = $<HTMLDialogElement>('#engine-dialog');
const enName = $<HTMLInputElement>('#en-name');
const enUrl = $<HTMLInputElement>('#en-url');

$('#add-engine').addEventListener('click', () => {
  enName.value = '';
  enUrl.value = '';
  for (const el of [enName, enUrl]) el.removeAttribute('aria-invalid');
  $('#en-name-error').textContent = '';
  $('#en-url-error').textContent = '';
  engineDialog.showModal();
  enName.focus();
});
$('#en-cancel').addEventListener('click', () => engineDialog.close());
$<HTMLFormElement>('#engine-form').addEventListener('submit', (e) => {
  const name = enName.value.trim();
  const url = enUrl.value.trim();
  const nameOk = name !== '';
  const urlOk = isValidEngineUrl(url);
  enName.setAttribute('aria-invalid', String(!nameOk));
  enUrl.setAttribute('aria-invalid', String(!urlOk));
  $('#en-name-error').textContent = nameOk ? '' : t('settings.search.customNameInvalid');
  $('#en-url-error').textContent = urlOk ? '' : t('settings.search.customUrlInvalid');
  if (!nameOk || !urlOk) {
    e.preventDefault();
    (nameOk ? enUrl : enName).focus();
    return;
  }
  const id = `custom-${Date.now().toString(36)}`;
  save({ customEngines: [...current.customEngines, { id, name, url, custom: true }], searchEngine: id });
});

// Reset
const resetDialog = $<HTMLDialogElement>('#reset-dialog');
$('#reset').addEventListener('click', () => resetDialog.showModal());
resetDialog.addEventListener('close', () => {
  if (resetDialog.returnValue === 'reset') {
    store.reset();
    snackbar(t('settings.saved'));
  }
});

// Highlight the section in view in the navigation.
const links = [...document.querySelectorAll<HTMLAnchorElement>('.settings-nav a')];
function markNav(id: string): void {
  for (const a of links) a.setAttribute('aria-current', String(a.hash === `#${id}`));
}
markNav(location.hash.slice(1) || 'search');
const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (visible) markNav(visible.target.id);
  },
  { rootMargin: '-20% 0px -60% 0px' },
);
for (const s of document.querySelectorAll('.settings-section')) observer.observe(s);

// Last, so every constant above exists before the first render.
store = startPage('settings.pageTitle', (p) => {
  current = p;
  render(p);
});
