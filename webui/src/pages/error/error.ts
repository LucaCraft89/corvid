// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

import { t } from '../../strings/i18n.js';
import { $, h, icon, snackbar } from '../../shared/dom.js';
import { startPage } from '../../shared/page.js';
import { buildErrorView, detailsText, errorInfoFromQuery, type ErrorInfo } from '../../shared/errors.js';
import { SAMPLES } from './samples.js';

/**
 * What the buttons do. In the browser (phase 5) these call into the error
 * page controller; on the dev server they just navigate.
 */
export interface ErrorActions {
  reload(): void;
  back(): void;
  proceed(): void;
}

/** Objects Chromium installs in its error pages (net error page, certificate interstitial). */
interface NetErrorController { reloadButtonClick(): void }
interface InterstitialController { dontProceed(): void; proceed(): void; reload(): void }

declare global {
  interface Window {
    corvidErrorActions?: ErrorActions;
    corvidErrorInfo?: ErrorInfo;
    errorPageController?: NetErrorController;
    certificateErrorPageController?: InterstitialController;
  }
}

startPage('error.generic.title');

const sample = new URLSearchParams(location.search).get('sample');
const info: ErrorInfo = window.corvidErrorInfo ?? (sample ? SAMPLES[sample] : undefined) ?? errorInfoFromQuery(location.search);
const view = buildErrorView(info);
// Chromium installs its controllers after the page commits, so look them up on click.
const actions: ErrorActions = window.corvidErrorActions ?? {
  reload: () => {
    if (window.certificateErrorPageController) window.certificateErrorPageController.reload();
    else if (window.errorPageController) window.errorPageController.reloadButtonClick();
    else if (info.url) location.assign(info.url);
    else location.reload();
  },
  back: () => {
    if (window.certificateErrorPageController) window.certificateErrorPageController.dontProceed();
    else history.back();
  },
  proceed: () => {
    if (window.certificateErrorPageController) window.certificateErrorPageController.proceed();
    else if (info.url) location.assign(info.url);
  },
};

document.title = view.title;
const root = $('#err');
root.dataset['kind'] = view.kind;
$('#err-icon').append(icon(view.icon));
$('#err-title').textContent = view.title;
$('#err-summary').textContent = view.summary;
if (view.reason) {
  const r = $('#err-reason');
  r.textContent = view.reason;
  r.hidden = false;
}
$('#err-tips').replaceChildren(...view.tips.map((tip) => h('li', {}, tip)));

function button(label: string, cls: string, iconName: string | null, onClick: () => void): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `button ${cls}` }, iconName ? icon(iconName) : null, label);
  b.addEventListener('click', onClick);
  return b;
}

const bar = $('#err-actions');
if (view.kind === 'ssl') {
  bar.append(button(t('error.ssl.goBackSafe'), '', 'back', actions.back));
} else {
  bar.append(button(t('error.tryAgain'), '', 'refresh', actions.reload));
  if (history.length > 1) bar.append(button(t('error.goBack'), 'tonal', null, actions.back));
}

$('#err-detail-body').replaceChildren(
  ...view.details.map((s) =>
    h('section', { class: 'detail-section' },
      h('h3', {}, s.title),
      h('dl', {}, ...s.rows.flatMap((r) => [h('dt', {}, r.label), h('dd', { class: r.mono ? 'mono' : undefined }, r.value)])))),
);

if (view.canProceed) {
  $('#err-proceed').hidden = false;
  const p = $<HTMLButtonElement>('#proceed');
  p.textContent = t('error.ssl.proceed', { host: view.host });
  p.addEventListener('click', actions.proceed);
}

$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(detailsText(view));
    snackbar(t('error.copied'));
  } catch {
    // Clipboard blocked: select the text so the user can copy it.
    const range = document.createRange();
    range.selectNodeContents($('#err-detail-body'));
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  }
});

if (view.autoRetry) {
  $('#err-auto').hidden = false;
  window.addEventListener('online', actions.reload);
}
