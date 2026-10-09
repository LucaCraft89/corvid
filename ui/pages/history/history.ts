import { html, type TemplateResult } from 'lit';
import { CvPage } from '../shared/page.ts';
import { pageApi } from '../shared/api.ts';
import { groupHistory, type HistoryVisit } from '../shared/logic.ts';

export class CorvidHistory extends CvPage {
  static override properties = { visits: { state: true }, filter: { state: true } };
  declare visits: HistoryVisit[];
  declare filter: string;
  constructor() { super(); this.visits = []; this.filter = ''; }
  override async connectedCallback(): Promise<void> {
    super.connectedCallback();
    this.visits = await pageApi().history.query('', 5000);
  }
  protected heading(): string { return this.t('history.title'); }
  private async removeItem(id: string) { await pageApi().history.remove(id); this.visits = this.visits.filter((v) => v.id !== id); }
  private async clearAll() { await pageApi().history.clearAll(); this.visits = []; }
  protected body(): TemplateResult {
    const groups = groupHistory(this.visits, Date.now(), this.filter);
    return html`
      <div class="row">
        <input class="grow" type="search" aria-label=${this.t('history.search')} placeholder=${this.t('history.search')} @input=${(e: Event) => { this.filter = (e.target as HTMLInputElement).value; }}>
        <button class="tonal" @click=${() => this.clearAll()}>${this.t('history.clearAll')}</button>
      </div>
      ${groups.length === 0 ? html`<p class="muted">${this.t('history.empty')}</p>` : groups.map((g) => html`
        <section aria-labelledby=${`g${g.key}`}>
          <h2 id=${`g${g.key}`}>${'key' in g.label ? this.t(g.label.key) : g.label.date}</h2>
          <ul class="plain">${g.visits.map((v) => html`
            <li class="row card">
              <span class="muted">${new Date(v.time).toLocaleTimeString()}</span>
              <a class="grow" href=${v.url}>${v.title || v.url}</a>
              <button aria-label=${this.t('history.remove', { title: v.title || v.url })} @click=${() => this.removeItem(v.id)}>${this.t('common.remove')}</button>
            </li>`)}</ul>
        </section>`)}`;
  }
}
customElements.define('corvid-history', CorvidHistory);
