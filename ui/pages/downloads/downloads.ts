import { html, type TemplateResult } from 'lit';
import { CvPage } from '../shared/page.ts';
import { pageApi, type DownloadItem } from '../shared/api.ts';
import { formatBytes } from '../shared/logic.ts';

export class CorvidDownloads extends CvPage {
  static override properties = { items: { state: true } };
  declare items: DownloadItem[];
  private off: (() => void) | undefined;
  constructor() { super(); this.items = []; }
  override async connectedCallback(): Promise<void> {
    super.connectedCallback();
    this.off = pageApi().downloads.onChanged(() => void this.load());
    await this.load();
  }
  override disconnectedCallback(): void { super.disconnectedCallback(); this.off?.(); }
  private async load() { this.items = await pageApi().downloads.list(); }
  protected heading(): string { return this.t('downloads.title'); }
  private actions(d: DownloadItem): TemplateResult {
    const a = pageApi().downloads;
    return html`
      ${d.state === 'in-progress' ? html`<button @click=${() => a.pause(d.id)}>${this.t('downloads.pause')}</button>` : ''}
      ${d.state === 'paused' ? html`<button @click=${() => a.resume(d.id)}>${this.t('downloads.resume')}</button>` : ''}
      ${d.state === 'in-progress' || d.state === 'paused' ? html`<button @click=${() => a.cancel(d.id)}>${this.t('common.cancel')}</button>` : ''}
      ${d.state === 'complete' ? html`<button @click=${() => a.open(d.id)}>${this.t('downloads.open')}</button><button @click=${() => a.showInFolder(d.id)}>${this.t('downloads.show')}</button>` : ''}
      <button @click=${() => a.remove(d.id)}>${this.t('common.remove')}</button>`;
  }
  protected body(): TemplateResult {
    return html`
      <div class="row"><span class="grow"></span><button class="tonal" @click=${() => pageApi().downloads.clearFinished()}>${this.t('downloads.clearFinished')}</button></div>
      ${this.items.length === 0 ? html`<p class="muted">${this.t('downloads.empty')}</p>` : html`<ul class="plain">${this.items.map((d) => html`
        <li class="card">
          <div class="row"><strong class="grow">${d.fileName}</strong><span class="muted">${this.t(`downloads.state.${d.state}`)}</span></div>
          ${d.dangerous ? html`<p class="error" role="alert">${this.t('downloads.dangerous')}</p>` : ''}
          ${d.state === 'in-progress' || d.state === 'paused' ? html`<progress max=${d.totalBytes || 1} value=${d.receivedBytes} aria-label=${d.fileName}></progress>
            <span class="muted">${formatBytes(d.receivedBytes)} / ${d.totalBytes ? formatBytes(d.totalBytes) : '?'}${d.bytesPerSec ? ` (${formatBytes(d.bytesPerSec)}/s)` : ''}</span>` : html`<span class="muted">${formatBytes(d.receivedBytes)}</span>`}
          <div class="row">${this.actions(d)}</div>
        </li>`)}</ul>`}`;
  }
}
customElements.define('corvid-downloads', CorvidDownloads);
