// corvid://gpu: hardware acceleration status (Corvid replacement for the stock GPU diagnostics page).
// Acceptance check 11 reads this page's DOM: [data-feature], [data-codec], .problems.
import { html, type TemplateResult } from 'lit';
import { CvPage } from '../shared/page.ts';
import { pageApi, type GpuInfo } from '../shared/api.ts';

export class CorvidGpu extends CvPage {
  static override properties = { info: { state: true } };
  declare info: GpuInfo | undefined;
  override async connectedCallback(): Promise<void> { super.connectedCallback(); this.info = await pageApi().gpu.info(); }
  protected heading(): string { return this.t('gpu.title'); }
  private codecs(rows: GpuInfo['videoDecode'], kind: string): TemplateResult {
    return html`<table><thead><tr><th>${this.t('gpu.codec')}</th><th>${this.t('gpu.profile')}</th><th>${this.t('gpu.hardware')}</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr data-codec=${`${kind}:${r.codec}`}><td>${r.codec}</td><td>${r.profile}</td><td>${r.hardware ? this.t('common.yes') : this.t('common.no')}</td></tr>`)}</tbody></table>`;
  }
  protected body(): TemplateResult {
    const i = this.info;
    if (!i) return html`<p class="muted">${this.t('common.loading')}</p>`;
    return html`
      <table><tbody>
        <tr><th scope="row">${this.t('gpu.renderer')}</th><td>${i.glRenderer}</td></tr>
        <tr><th scope="row">${this.t('gpu.angle')}</th><td>${i.angleBackend}</td></tr>
        <tr><th scope="row">${this.t('gpu.ozone')}</th><td>${i.ozonePlatform}</td></tr>
        <tr><th scope="row">${this.t('gpu.vaapi')}</th><td>${i.vaapiDriver ?? this.t('error.none')}</td></tr>
      </tbody></table>
      <h2>${this.t('gpu.features')}</h2>
      <table><tbody>${i.features.map((f) => html`<tr data-feature=${f.name} data-status=${f.status}><th scope="row">${f.name}</th><td>${this.t(`gpu.status.${f.status}`)}${f.detail ? html` <span class="muted">${f.detail}</span>` : ''}</td></tr>`)}</tbody></table>
      <h2>${this.t('gpu.decode')}</h2>${this.codecs(i.videoDecode, 'decode')}
      <h2>${this.t('gpu.encode')}</h2>${this.codecs(i.videoEncode, 'encode')}
      ${i.problems.length ? html`<h2>${this.t('gpu.problems')}</h2><ul class="problems">${i.problems.map((p) => html`<li class="error">${p}</li>`)}</ul>` : ''}`;
  }
}
customElements.define('corvid-gpu', CorvidGpu);
