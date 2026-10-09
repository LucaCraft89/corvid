// Shown instead of any stock chrome:// page that Corvid has not replaced (see docs/stock-pages.md).
import { html, type TemplateResult } from 'lit';
import { CvPage } from '../shared/page.ts';

export class CorvidBlocked extends CvPage {
  protected heading(): string { return this.t('blocked.title'); }
  protected body(): TemplateResult {
    const requested = new URLSearchParams(location.search).get('url') ?? '';
    return html`<p>${this.t('blocked.summary')}</p>
      ${requested ? html`<p class="muted"><code>${requested}</code></p>` : ''}
      <p><a href="corvid://newtab?default">${this.t('blocked.home')}</a></p>`;
  }
}
customElements.define('corvid-blocked', CorvidBlocked);
