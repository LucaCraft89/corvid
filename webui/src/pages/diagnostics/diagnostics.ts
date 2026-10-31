// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { t } from '../../strings/i18n.js';
import { $, h, snackbar } from '../../shared/dom.js';
import { inBrowser, onBrowser, send } from '../../shared/bridge.js';
import { diagnosticsText, entrySummary, kindLabel, sanitizeEntries, type DiagEntry } from '../../shared/diagnostics.js';
import { startPage } from '../../shared/page.js';
import { SAMPLE_LOG } from './samples.js';

let entries: DiagEntry[] = [];

function localTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function render(): void {
  $('#count').textContent = t('diag.count', { count: entries.length });
  $('#empty').hidden = entries.length > 0;
  $('#list').replaceChildren(
    ...entries.map((e) =>
      h('li', { class: 'diag-entry', 'data-kind': e.kind },
        h('span', { class: 'diag-badge' }, kindLabel(e.kind)),
        h('p', { class: 'diag-summary body-medium' }, entrySummary(e)),
        h('p', { class: 'diag-meta' }, `${localTime(e.time)} · ${e.code}`))),
  );
}

$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(diagnosticsText(entries));
    snackbar(t('diag.copied'));
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('#list'));
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  }
});
$('#clear').addEventListener('click', () => {
  entries = [];
  render();
  send('corvidClearDiagnostics');
});

// The browser sends the whole log when asked and again on every new entry.
onBrowser('diagnostics', (raw) => {
  entries = sanitizeEntries(raw);
  render();
});

// Last, so every constant above exists before the first render.
startPage('diag.pageTitle');
send('corvidGetDiagnostics');
if (!inBrowser()) entries = sanitizeEntries(new URLSearchParams(location.search).has('empty') ? [] : SAMPLE_LOG);
render();
