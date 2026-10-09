import {LitElement, html, css, nothing} from 'lit';
import strings from './strings.en.json';
import {MojoSyncProxy, OFF_BY_DEFAULT, SYNCABLE, SyncError} from './proxy.js';
import type {CollectionId, DeviceRow, SyncBrowserProxy, SyncState} from './proxy.js';

// All user-visible text goes through the i18n catalog (AGENTS.md rule 7).
type Key = keyof typeof strings;
export function t(key: Key, params: Record<string, string | number> = {}): string {
  let s: string = strings[key];
  for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export class CorvidSyncPage extends LitElement {
  static properties = {
    st: {state: true}, devices: {state: true}, busy: {state: true}, error: {state: true},
    recoveryKey: {state: true}, mode: {state: true},
  };
  declare st: SyncState | null;
  declare devices: DeviceRow[];
  declare busy: boolean;
  declare error: string;
  declare recoveryKey: string;
  declare mode: 'create' | 'signin' | 'recover';
  proxy: SyncBrowserProxy = new MojoSyncProxy();

  constructor() {
    super();
    this.st = null; this.devices = []; this.busy = false; this.error = ''; this.recoveryKey = ''; this.mode = 'signin';
  }

  // Theme tokens only (Material 3 roles from theme/), no hard-coded colours.
  static styles = css`
    :host { display: block; max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; color: var(--md-sys-color-on-surface); font: var(--md-sys-typescale-body-large, 16px/1.5 system-ui); }
    h1 { font: var(--md-sys-typescale-headline-large, 28px/1.2 system-ui); margin: 0 0 4px; }
    h2 { font: var(--md-sys-typescale-title-medium, 18px/1.3 system-ui); margin: 0 0 12px; }
    .sub { color: var(--md-sys-color-on-surface-variant); margin: 0 0 24px; }
    section { background: var(--md-sys-color-surface-container); border-radius: var(--md-sys-shape-corner-large, 20px); padding: 20px; margin-bottom: 16px; }
    label { display: block; margin: 12px 0 4px; font-weight: 500; }
    .hint { color: var(--md-sys-color-on-surface-variant); font-size: 0.875em; margin: 2px 0 0; }
    input[type=text], input[type=password], input[type=url] { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: var(--md-sys-shape-corner-small, 8px); border: 1px solid var(--md-sys-color-outline); background: var(--md-sys-color-surface); color: inherit; font: inherit; }
    button { min-height: 40px; padding: 0 20px; border-radius: var(--md-sys-shape-corner-full, 999px); border: 0; cursor: pointer; font: inherit; background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
    button.secondary { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
    button.danger { background: var(--md-sys-color-error); color: var(--md-sys-color-on-error); }
    button:focus-visible, input:focus-visible { outline: 3px solid var(--md-sys-color-tertiary); outline-offset: 2px; }
    button[disabled] { opacity: 0.5; cursor: default; }
    .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li.dev { padding: 12px 0; border-top: 1px solid var(--md-sys-color-outline-variant); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    li.dev:first-child { border-top: 0; }
    .grow { flex: 1 1 200px; }
    .fp { font-family: var(--md-sys-typescale-mono, monospace); letter-spacing: 0.05em; }
    .alert { background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); padding: 12px 16px; border-radius: var(--md-sys-shape-corner-medium, 12px); margin-bottom: 16px; }
    .key { font-family: var(--md-sys-typescale-mono, monospace); font-size: 1.1em; word-break: break-all; padding: 12px; background: var(--md-sys-color-surface); border-radius: var(--md-sys-shape-corner-small, 8px); user-select: all; }
    .toggle { display: flex; align-items: center; gap: 12px; padding: 8px 0; margin: 0; font-weight: 400; }
    .toggle input { width: 20px; height: 20px; }
  `;

  connectedCallback() {
    super.connectedCallback();
    void this.refresh();
  }

  async refresh() {
    try {
      this.st = await this.proxy.getState();
      this.devices = this.st.signedIn && !this.st.pendingApproval ? await this.proxy.listDevices() : [];
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown) {
    if (e instanceof SyncError) {
      this.error = e.code === 'wrong_passphrase' ? t('error.wrongPassphrase')
        : e.code === 'rate_limited' ? t('error.rateLimited')
        : e.code === 'rollback' ? t('error.rollback') : t('error.generic', {msg: e.message});
    } else {
      this.error = t('error.generic', {msg: e instanceof Error ? e.message : String(e)});
    }
  }

  private async run(fn: () => Promise<void>) {
    this.busy = true; this.error = '';
    try { await fn(); await this.refresh(); } catch (e) { this.fail(e); } finally { this.busy = false; }
  }

  private val(id: string): string {
    return (this.renderRoot.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? '';
  }

  private field(id: string, label: Key, type: 'text' | 'password' | 'url', hint?: Key) {
    return html`<label for=${id}>${t(label)}</label>
      <input id=${id} type=${type} autocomplete=${type === 'password' ? 'off' : 'on'} aria-describedby=${hint ? id + '-h' : nothing}>
      ${hint ? html`<p class="hint" id=${id + '-h'}>${t(hint)}</p>` : nothing}`;
  }

  render() {
    if (!this.st) return html`<p role="status">${t('busy')}</p>`;
    return html`
      <h1>${t('title')}</h1>
      <p class="sub">${t('subtitle')}</p>
      ${this.error ? html`<div class="alert" role="alert">${this.error}</div>` : nothing}
      ${this.recoveryKey ? this.renderRecovery() : nothing}
      ${this.st.signedIn ? this.renderSignedIn() : this.renderSignedOut()}
    `;
  }

  private renderRecovery() {
    return html`<section aria-labelledby="rk-h" id="recovery-dialog">
      <h2 id="rk-h">${t('recovery.title')}</h2>
      <p>${t('recovery.body')}</p>
      <div class="key" id="recovery-key" tabindex="0">${this.recoveryKey}</div>
      <label class="toggle"><input type="checkbox" id="rk-confirm" @change=${() => this.requestUpdate()}> ${t('recovery.confirm')}</label>
      <div class="row"><button id="rk-done" ?disabled=${!(this.renderRoot.querySelector('#rk-confirm') as HTMLInputElement | null)?.checked}
        @click=${() => { this.recoveryKey = ''; }}>${t('recovery.done')}</button></div>
    </section>`;
  }

  private renderSignedOut() {
    const m = this.mode;
    return html`<section aria-labelledby="auth-h">
      <h2 id="auth-h">${t('status.signedOut')}</h2>
      <div class="row" role="tablist">
        ${(['signin', 'create', 'recover'] as const).map((k) => html`<button role="tab" class=${m === k ? '' : 'secondary'} aria-selected=${m === k}
          id=${'tab-' + k} @click=${() => { this.mode = k; this.error = ''; }}>${t(k === 'signin' ? 'action.signIn' : k === 'create' ? 'action.create' : 'action.recover')}</button>`)}
      </div>
      ${this.field('server', 'server.label', 'url', 'server.hint')}
      ${this.field('user', 'user.label', 'text', 'user.hint')}
      ${m === 'recover' ? this.field('rkey', 'recover.key', 'text') : nothing}
      ${this.field('pass', m === 'recover' ? 'recover.newPass' : 'pass.label', 'password', m === 'create' ? 'pass.hint' : undefined)}
      ${m === 'create' ? this.field('token', 'token.label', 'text') : nothing}
      ${this.field('dev', 'device.label', 'text', 'device.hint')}
      <div class="row"><button id="submit" ?disabled=${this.busy} @click=${() => this.submit()}>${t(m === 'signin' ? 'action.signIn' : m === 'create' ? 'action.create' : 'action.recover')}</button></div>
    </section>`;
  }

  private submit() {
    const base = {serverUrl: this.val('server'), username: this.val('user'), deviceName: this.val('dev')};
    return this.run(async () => {
      if (this.mode === 'create') {
        const r = await this.proxy.createAccount({...base, passphrase: this.val('pass'), token: this.val('token')});
        this.recoveryKey = r.recoveryKey;
      } else if (this.mode === 'recover') {
        await this.proxy.recover({...base, recoveryKey: this.val('rkey'), newPassphrase: this.val('pass')});
      } else {
        await this.proxy.signIn({...base, passphrase: this.val('pass')});
      }
    });
  }

  private renderSignedIn() {
    const s = this.st!;
    if (s.pendingApproval) {
      return html`<section><h2>${t('status.pending')}</h2>
        <p>${t('status.pendingCode', {code: s.approvalCode})}</p>
        <p class="fp" id="approval-code">${s.approvalCode}</p>
        <p class="hint">${t('status.signedIn', {user: s.username, server: s.serverUrl})}</p>
        <div class="row"><button class="secondary" id="refresh" @click=${() => this.run(async () => {})}>${t('action.syncNow')}</button>
        <button class="secondary" id="signout" @click=${() => this.run(() => this.proxy.signOut())}>${t('action.signOut')}</button></div></section>`;
    }
    const pending = this.devices.filter((d) => d.state === 'pending');
    return html`
      <section aria-labelledby="st-h">
        <h2 id="st-h">${t('status.signedIn', {user: s.username, server: s.serverUrl})}</h2>
        <p class="hint" role="status">${s.lastSyncMs ? t('status.lastSync', {when: new Date(s.lastSyncMs).toLocaleString()}) : ''}
          ${s.queued ? t('status.queued', {n: s.queued}) : ''}</p>
        <div class="row"><button id="sync-now" ?disabled=${this.busy} @click=${() => this.run(() => this.proxy.syncNow())}>${t('action.syncNow')}</button>
          <button class="secondary" id="signout" @click=${() => this.run(() => this.proxy.signOut())}>${t('action.signOut')}</button></div>
      </section>
      ${s.integrityErrors > 0 ? html`<div class="alert" role="alert" id="integrity"><strong>${t('integrity.title')}</strong> ${t('integrity.body', {n: s.integrityErrors})}</div>` : nothing}
      ${pending.length ? html`<section aria-labelledby="pend-h" id="pending-section"><h2 id="pend-h">${t('devices.pending')}</h2>
        <ul>${pending.map((d) => html`<li class="dev"><span class="grow"><strong>${d.name}</strong><br><span class="fp">${t('devices.fingerprint', {fp: d.fingerprint})}</span></span>
          <button class="approve" ?disabled=${this.busy} @click=${() => this.run(() => this.proxy.approveDevice(d.id, d.fingerprint))}>${t('devices.approve')}</button>
          <button class="danger revoke-pending" ?disabled=${this.busy} @click=${() => this.run(() => this.proxy.revokeDevice(d.id, this.val('rev-pass')))}>${t('devices.revoke')}</button></li>`)}</ul></section>` : nothing}
      <section aria-labelledby="col-h"><h2 id="col-h">${t('collections.title')}</h2><p class="hint">${t('collections.note')}</p>
        ${SYNCABLE.map((c) => this.toggle(c, true))}</section>
      <section aria-labelledby="dev-h"><h2 id="dev-h">${t('devices.title')}</h2>
        <ul>${this.devices.filter((d) => d.state !== 'pending').map((d) => html`<li class="dev"><span class="grow"><strong>${d.name}</strong>${d.self ? html` (${t('devices.this')})` : nothing}<br>
          <span class="hint">${t(d.state === 'approved' ? 'devices.approved' : 'devices.revoked')} <span class="fp">${d.fingerprint}</span></span></span>
          ${d.state === 'approved' && !d.self ? html`<button class="danger revoke" ?disabled=${this.busy} @click=${() => this.run(() => this.proxy.revokeDevice(d.id, this.val('rev-pass')))}>${t('devices.revoke')}</button>` : nothing}</li>`)}</ul>
        ${this.field('rev-pass', 'pass.label', 'password')}
        <p class="hint">${t('devices.revokeNote')}</p></section>
      <section aria-labelledby="sec-h"><h2 id="sec-h">${t('security.title')}</h2>
        ${this.field('old-pass', 'security.oldPass', 'password')}${this.field('new-pass', 'security.newPass', 'password')}
        <div class="row"><button id="change-pass" ?disabled=${this.busy} @click=${() => this.run(() => this.proxy.changePassphrase(this.val('old-pass'), this.val('new-pass')))}>${t('security.change')}</button>
        <button class="secondary" id="rotate-rk" ?disabled=${this.busy} @click=${() => this.run(async () => { this.recoveryKey = (await this.proxy.rotateRecoveryKey()).recoveryKey; })}>${t('security.rotateRecovery')}</button></div></section>
      ${s.unavailableModules.length ? html`<section aria-labelledby="um-h" id="unavailable-modules"><h2 id="um-h">${t('modules.unavailable.title')}</h2>
        <p class="hint">${t('modules.unavailable.body')}</p><ul>${s.unavailableModules.map((m) => html`<li>${m}</li>`)}</ul></section>` : nothing}
      <section aria-labelledby="dz-h"><h2 id="dz-h">${t('danger.title')}</h2><p>${t('danger.body')}</p>
        <button class="danger" id="delete-account" ?disabled=${this.busy} @click=${() => this.run(() => this.proxy.deleteAccount())}>${t('danger.delete')}</button></section>`;
  }

  private toggle(c: CollectionId, available: boolean) {
    const on = available && (this.st!.enabled[c] ?? !OFF_BY_DEFAULT.includes(c));
    return html`<label class="toggle"><input type="checkbox" class="col" data-col=${c} .checked=${on} ?disabled=${!available || this.busy}
      @change=${(e: Event) => this.run(() => this.proxy.setCollectionEnabled(c, (e.target as HTMLInputElement).checked))}> ${t(('collection.' + c) as Key)}</label>`;
  }
}
customElements.define('corvid-sync-page', CorvidSyncPage);
