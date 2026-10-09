import { html, type TemplateResult } from 'lit';
import { CvPage } from '../shared/page.ts';
import { pageApi } from '../shared/api.ts';

export class CorvidCrash extends CvPage {
  static override properties = { info: { state: true } };
  declare info: { url: string; reason: string; reportPath?: string } | undefined;
  override async connectedCallback(): Promise<void> { super.connectedCallback(); this.info = await pageApi().crash.info(); }
  protected heading(): string { return this.t('crash.title'); }
  protected body(): TemplateResult {
    const i = this.info;
    return html`<p>${this.t('crash.summary')}</p>
      <p class="muted">${this.t('crash.local')}</p>
      <div class="row"><button class="filled" @click=${() => pageApi().crash.reload()}>${this.t('crash.reload')}</button></div>
      ${i ? html`<details><summary>${this.t('error.details')}</summary>
        <table><tbody><tr><th scope="row">${this.t('error.url')}</th><td>${i.url}</td></tr>
        <tr><th scope="row">${this.t('crash.reason')}</th><td>${i.reason}</td></tr>
        ${i.reportPath ? html`<tr><th scope="row">${this.t('crash.report')}</th><td>${i.reportPath}</td></tr>` : ''}</tbody></table></details>` : ''}`;
  }
}
customElements.define('corvid-crash', CorvidCrash);
