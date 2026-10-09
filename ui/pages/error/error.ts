// Error, offline and SSL pages share one element: plain-language summary first, then expandable
// technical detail (DNS result, resolver, TLS chain/errors, timings, retry log, error code).
import { html, type TemplateResult } from 'lit';
import { CvPage } from '../shared/page.ts';
import { pageApi } from '../shared/api.ts';
import { canProceedUnsafe, classifyError, type ErrorClassification, type ErrorDetail } from '../shared/logic.ts';

export class CorvidError extends CvPage {
  static override properties = { detail: { state: true } };
  declare detail: ErrorDetail | undefined;
  override async connectedCallback(): Promise<void> { super.connectedCallback(); this.detail = await pageApi().error.detail(); }
  private get cls(): ErrorClassification | undefined { return this.detail && classifyError(this.detail.errorName); }
  protected heading(): string { return this.cls ? this.t(`error.title.${this.cls.page}`) : this.t('common.loading'); }
  private report(d: ErrorDetail): string { return JSON.stringify(d, null, 2); }
  protected body(): TemplateResult {
    const d = this.detail, c = this.cls;
    if (!d || !c) return html`<p class="muted">${this.t('common.loading')}</p>`;
    const api = pageApi().error;
    return html`
      <p>${this.t(c.summaryKey, { url: d.url })}</p>
      <ul>${c.hintKeys.map((k) => html`<li>${this.t(k)}</li>`)}</ul>
      <div class="row">
        <button class="filled" @click=${() => api.retry()}>${this.t('error.retry')}</button>
        <button class="tonal" @click=${() => api.goBack()}>${this.t('error.back')}</button>
        ${canProceedUnsafe(d.errorName, d.hsts ?? false) ? html`<button @click=${() => api.proceedUnsafe()}>${this.t('error.proceedUnsafe')}</button>` : ''}
      </div>
      <details>
        <summary>${this.t('error.details')}</summary>
        <table><tbody>
          <tr><th scope="row">${this.t('error.url')}</th><td>${d.url}</td></tr>
          <tr><th scope="row">${this.t('error.code')}</th><td>${d.errorName} (${d.errorCode})</td></tr>
          ${d.resolver ? html`<tr><th scope="row">${this.t('error.resolver')}</th><td>${d.resolver}</td></tr>` : ''}
          ${d.dnsResult ? html`<tr><th scope="row">${this.t('error.dnsResult')}</th><td>${d.dnsResult.join(', ') || this.t('error.none')}</td></tr>` : ''}
        </tbody></table>
        ${d.tls ? html`<h2>${this.t('error.tls')}</h2>
          <p>${[d.tls.protocol, d.tls.cipher].filter(Boolean).join(' / ')}</p>
          ${(d.tls.errors ?? []).map((e) => html`<p class="error">${e}</p>`)}
          <ol>${(d.tls.chain ?? []).map((x) => html`<li>${x.subject} <span class="muted">${this.t('error.issuedBy', { issuer: x.issuer })}; ${x.notBefore} - ${x.notAfter}</span></li>`)}</ol>` : ''}
        ${d.timings ? html`<h2>${this.t('error.timings')}</h2><table><tbody>${d.timings.map((x) => html`<tr><th scope="row">${x.phase}</th><td>${x.ms} ms</td></tr>`)}</tbody></table>` : ''}
        ${d.retryLog?.length ? html`<h2>${this.t('error.retryLog')}</h2><ul>${d.retryLog.map((r) => html`<li>${r.at}: ${r.result}</li>`)}</ul>` : ''}
        <button @click=${() => api.copyReport(this.report(d))}>${this.t('error.copy')}</button>
      </details>`;
  }
}
customElements.define('corvid-error', CorvidError);
