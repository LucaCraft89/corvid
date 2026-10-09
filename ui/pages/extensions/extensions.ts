import { css, html, type TemplateResult } from 'lit';
import { CvPage, pageStyles } from '../shared/page.ts';
import { pageApi, type ExtensionInfo } from '../shared/api.ts';
import type { NtpExtension } from '../shared/logic.ts';

export class CorvidExtensions extends CvPage {
  static override properties = { exts: { state: true }, ntp: { state: true }, picked: { state: true }, sources: { state: true } };
  declare exts: ExtensionInfo[];
  declare ntp: NtpExtension[];
  declare picked: string | null;
  declare sources: Array<{ id: string; name: string; updateUrl: string; enabled: boolean }>;
  private off: (() => void) | undefined;
  constructor() { super(); this.exts = []; this.ntp = []; this.picked = null; this.sources = []; }
  static override styles = [pageStyles, css`.badge { padding: 0.125rem 0.5rem; border-radius: var(--cv-shape-full); background: var(--cv-color-tertiary-container); color: var(--cv-color-on-tertiary-container); font-size: var(--cv-type-label-small-size); }`];
  override async connectedCallback(): Promise<void> {
    super.connectedCallback();
    this.off = pageApi().extensions.onChanged(() => void this.load());
    await this.load();
  }
  override disconnectedCallback(): void { super.disconnectedCallback(); this.off?.(); }
  private async load() {
    const a = pageApi().extensions;
    this.exts = await a.list();
    const n = await a.ntp();
    this.ntp = n.candidates; this.picked = n.picked;
    this.sources = await a.storeSources();
  }
  protected heading(): string { return this.t('extensions.title'); }
  private card(e: ExtensionInfo): TemplateResult {
    const a = pageApi().extensions;
    return html`<li class="card">
      <div class="row">
        <img src=${e.iconUrl} alt="" width="32" height="32">
        <div class="grow"><strong>${e.name}</strong> <span class="muted">${e.version}</span>
          <span class="badge">MV${e.manifestVersion}</span>${e.preinstalled ? html` <span class="badge">${this.t('extensions.preinstalled')}</span>` : ''}</div>
        <label><input type="checkbox" .checked=${e.enabled} @change=${(ev: Event) => a.setEnabled(e.id, (ev.target as HTMLInputElement).checked)}> ${this.t('extensions.enabled')}</label>
      </div>
      <p class="muted">${e.description}</p>
      ${e.warnings.map((w) => html`<p class="error" role="alert">${w}</p>`)}
      <details><summary>${this.t('extensions.permissions')}</summary>
        <ul>${[...e.permissions, ...e.hostPermissions].map((p) => html`<li>${p}</li>`)}</ul></details>
      <div class="row">
        <label><input type="checkbox" .checked=${e.allowedInIncognito} @change=${(ev: Event) => a.setIncognito(e.id, (ev.target as HTMLInputElement).checked)}> ${this.t('extensions.incognito')}</label>
        <button @click=${() => a.remove(e.id)}>${this.t('common.remove')}</button>
      </div></li>`;
  }
  protected body(): TemplateResult {
    const a = pageApi().extensions;
    return html`
      <div class="row"><button class="tonal" @click=${() => a.loadUnpacked()}>${this.t('extensions.loadUnpacked')}</button></div>
      ${this.exts.length === 0 ? html`<p class="muted">${this.t('extensions.empty')}</p>` : html`<ul class="plain">${this.exts.map((e) => this.card(e))}</ul>`}
      <h2>${this.t('extensions.ntp.title')}</h2>
      <p class="muted">${this.t('extensions.ntp.help')}</p>
      <label>${this.t('extensions.ntp.label')}
        <select @change=${(ev: Event) => { const v = (ev.target as HTMLSelectElement).value; void a.setNtpPick(v === '' ? null : v); }}>
          <option value="" ?selected=${this.picked === null}>${this.t('extensions.ntp.auto')}</option>
          <option value="corvid" ?selected=${this.picked === 'corvid'}>${this.t('extensions.ntp.corvid')}</option>
          ${this.ntp.map((n) => html`<option value=${n.id} ?selected=${this.picked === n.id}>${n.name}</option>`)}
        </select></label>
      <h2>${this.t('extensions.sources.title')}</h2>
      <p class="muted">${this.t('extensions.sources.help')}</p>
      <p class="muted">${this.t('extensions.sources.terms')}</p>
      <p class="muted">${this.t('extensions.sources.manual')}</p>
      <ul class="plain">${this.sources.map((s) => html`<li class="row"><span class="grow">${s.name} <span class="muted">${s.updateUrl}</span></span><span>${s.enabled ? this.t('common.on') : this.t('common.off')}</span></li>`)}</ul>`;
  }
}
customElements.define('corvid-extensions', CorvidExtensions);
