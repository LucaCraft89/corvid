// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// corvid://sync: set up sync, pair devices, show the recovery key. The work is
// in components/corvid_sync (browser); this page only shows its view.

import { t } from '../../strings/i18n.js';
import { $, h, snackbar } from '../../shared/dom.js';
import { inBrowser, onBrowser, send } from '../../shared/bridge.js';
import { startPage } from '../../shared/page.js';
import { deviceNameProblem, isIntegrityStatus, sanitizeEvent, serverUrlProblem, type SyncView } from '../../shared/sync.js';
import { SAMPLES } from './samples.js';

const FAST_POLL_MS = 3000;
const SLOW_POLL_MS = 30000;

let view: SyncView | null = null;
let inviteOpen = false;
let pollTimer = 0;
let pollDelay = 0;

function input(id: string): HTMLInputElement {
  return $<HTMLInputElement>(`#${id}`);
}

function show(id: string, on: boolean): void {
  $(`#${id}`).hidden = !on;
}

function showError(text: string): void {
  $('#error').textContent = text;
  show('error', !!text);
}

function localTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

function statusText(v: SyncView): string {
  if (isIntegrityStatus(v.lastError)) return t('sync.status.integrity');
  if (v.lastError === 'auth') return t('sync.status.auth');
  if (v.lastError) return t('sync.status.offline');
  return v.lastSuccess ? t('sync.status.ok', { time: localTime(v.lastSuccess) }) : t('sync.status.starting');
}

function renderPairings(v: SyncView): void {
  $('#pairings').replaceChildren(
    ...v.pairings.map((p) => {
      const approve = h('button', { type: 'button', class: 'button', 'data-approve': p.id }, t('sync.pair.approve'));
      approve.addEventListener('click', () => send('corvidSyncApprove', p.id));
      const reject = h('button', { type: 'button', class: 'button text', 'data-reject': p.id }, t('sync.pair.reject'));
      reject.addEventListener('click', () => send('corvidSyncReject', p.id));
      return h('div', { class: 'card setting' },
        h('h2', { class: 'title-medium' }, t('sync.pair.title', { name: p.name })),
        h('p', { class: 'body-medium muted' }, t('sync.pair.help')),
        h('p', { class: 'sync-code' }, p.code),
        h('div', { class: 'sync-actions' }, approve, reject));
    }),
  );
}

function renderDevices(v: SyncView): void {
  $('#devices').replaceChildren(
    ...v.devices.map((d) => {
      const seen = d.lastSeen ? t('sync.devices.seen', { time: localTime(d.lastSeen * 1000) }) : '';
      const row = h('li', { class: 'sync-device', 'data-device': d.id },
        h('div', { class: 'sync-device-text' },
          h('span', { class: 'title-small' }, d.self ? t('sync.devices.self', { name: d.name }) : d.name),
          h('p', { class: 'body-small' }, d.inRoster ? seen : t('sync.devices.waiting'))));
      if (!d.self) {
        const remove = h('button', { type: 'button', class: 'button text', 'data-remove': d.id }, t('sync.devices.remove'));
        remove.addEventListener('click', () => {
          if (confirm(t('sync.devices.removeConfirm', { name: d.name }))) send('corvidSyncRemove', d.id);
        });
        row.append(remove);
      }
      return row;
    }),
  );
}

function render(): void {
  const v = view;
  if (!v) return;
  show('setup', v.mode === 'off');
  show('waiting', v.mode === 'waiting');
  show('active', v.mode === 'on');
  show('revoked', v.mode === 'revoked');
  show('unavailable', v.mode === 'unavailable');
  if (v.mode === 'waiting') $('#join-code').textContent = v.joinCode || t('sync.waiting.noCode');
  if (v.mode === 'on') {
    $('#status').textContent = statusText(v);
    $('#server-name').textContent = t('sync.status.server', { server: v.server });
    renderPairings(v);
    renderDevices(v);
  }
  if (v.loadError) showError(v.loadError);
  schedulePoll();
}

// Devices appear while the page is open: faster while something is expected.
function schedulePoll(): void {
  // Hidden tabs have their timers throttled; catch up when shown again. The
  // browser keeps handling the mailbox and pushes changes here meanwhile.
  if (!inBrowser() || document.hidden || !view || view.mode === 'off' || view.mode === 'unavailable' || view.mode === 'revoked') {
    clearTimeout(pollTimer);
    pollTimer = 0;
    return;
  }
  const fast = view.mode === 'waiting' || inviteOpen || view.pairings.length > 0;
  const delay = fast ? FAST_POLL_MS : SLOW_POLL_MS;
  // The browser also pushes views on its own: an earlier timer must keep
  // running, or frequent pushes would postpone it for ever.
  if (pollTimer && pollDelay <= delay) return;
  clearTimeout(pollTimer);
  pollDelay = delay;
  pollTimer = window.setTimeout(() => {
    pollTimer = 0;
    send('corvidSyncGet');
  }, delay);
}

function setFieldError(id: string, text: string): boolean {
  $(`#${id}-error`).textContent = text;
  input(id).toggleAttribute('aria-invalid', !!text);
  return !text;
}

// Both fields of the setup card; true when they can be sent.
function checkSetupFields(): boolean {
  const server = serverUrlProblem(input('server').value);
  const name = deviceNameProblem(input('device-name').value);
  const a = setFieldError('server', server ? t(`sync.server.${server}`) : '');
  const b = setFieldError('device-name', name ? t(`sync.deviceName.${name}`) : '');
  return a && b;
}

function setupArgs(): [string, string] {
  return [input('server').value.trim(), input('device-name').value.trim()];
}

function onSubmit(id: string, handler: () => void): void {
  $(`#${id}`).addEventListener('submit', (e) => {
    e.preventDefault();
    showError('');
    if (checkSetupFields()) handler();
  });
}

onSubmit('join-form', () => {
  const [server, name] = setupArgs();
  send('corvidSyncJoin', server, input('invite').value.trim(), name);
});
onSubmit('create-form', () => {
  const [server, name] = setupArgs();
  send('corvidSyncCreate', server, input('token').value.trim(), name);
});
onSubmit('recover-form', () => {
  const [server, name] = setupArgs();
  send('corvidSyncRecover', server, input('recover-token').value.trim(), name, input('recover-key').value.trim());
});

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    snackbar(t('sync.copied'));
  } catch {
    snackbar(t('sync.copyFailed'));
  }
}

$('#invite-create').addEventListener('click', () => send('corvidSyncInvite'));
$('#invite-copy').addEventListener('click', () => copy($('#invite-code').textContent ?? ''));
$('#recovery-copy').addEventListener('click', () => copy($('#recovery-key').textContent ?? ''));
$('#recovery-hide').addEventListener('click', () => {
  $('#recovery-key').textContent = '';
  show('recovery', false);
});
$('#show-key').addEventListener('click', () => send('corvidSyncShowKey'));
$('#turn-off').addEventListener('click', () => {
  if (confirm(t('sync.off.confirm'))) send('corvidSyncOff');
});
$('#waiting-cancel').addEventListener('click', () => send('corvidSyncOff'));
$('#revoked-reset').addEventListener('click', () => send('corvidSyncOff'));

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) send('corvidSyncGet');
});

onBrowser('sync', (raw) => {
  const e = sanitizeEvent(raw);
  view = e.view;
  if (e.error) showError(e.integrity ? t('sync.error.integrity', { error: e.error }) : e.error);
  if (e.recoveryKey) {
    $('#recovery-key').textContent = e.recoveryKey;
    show('recovery', true);
  }
  if (e.inviteCode) {
    $('#invite-code').textContent = e.inviteCode;
    show('invite-box', true);
    inviteOpen = true;
  }
  if (view.pairings.length) inviteOpen = false;
  render();
});

// Last, so every constant above exists before the first render.
startPage('sync.pageTitle');
send('corvidSyncGet');
if (!inBrowser()) {
  const sample = new URLSearchParams(location.search).get('state') ?? 'off';
  view = sanitizeEvent({ view: SAMPLES[sample] ?? SAMPLES.off }).view;
  render();
}
