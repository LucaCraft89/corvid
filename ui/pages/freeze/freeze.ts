import { html, type TemplateResult } from 'lit';
import { CvPage } from '../shared/page.ts';
import { pageApi } from '../shared/api.ts';
import { formatDuration } from '../shared/logic.ts';

export class CorvidFreeze extends CvPage {
  static override properties = { info: { state: true } };
  declare info: { url: string; hungForMs: number; stackAvailable: boolean } | undefined;
  override async connectedCallback(): Promise<void> { super.connectedCallback(); this.info = await pageApi().freeze.info(); }
  protected heading(): string { return this.t('freeze.title'); }
  protected body(): TemplateResult {
    const i = this.info;
    return html`<p>${this.t('freeze.summary', { duration: i ? formatDuration(i.hungForMs / 1000) : '-' })}</p>
      ${i && !i.stackAvailable ? html`<p class="muted">${this.t('freeze.noStack')}</p>` : ''}
      <div class="row">
        <button class="filled" @click=${() => pageApi().freeze.wait()}>${this.t('freeze.wait')}</button>
        <button class="tonal" @click=${() => pageApi().freeze.kill()}>${this.t('freeze.kill')}</button>
      </div>`;
  }
}
customElements.define('corvid-freeze', CorvidFreeze);
