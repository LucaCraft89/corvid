import { html, type TemplateResult } from 'lit';
import { CvPage } from '../shared/page.ts';
import { pageApi, type BookmarkNode } from '../shared/api.ts';

export class CorvidBookmarks extends CvPage {
  static override properties = { nodes: { state: true } };
  declare nodes: BookmarkNode[];
  constructor() { super(); this.nodes = []; }
  override async connectedCallback(): Promise<void> { super.connectedCallback(); this.nodes = await pageApi().bookmarks.tree(); }
  protected heading(): string { return this.t('bookmarks.title'); }
  private async removeItem(id: string) { await pageApi().bookmarks.remove(id); this.nodes = await pageApi().bookmarks.tree(); }
  private node(n: BookmarkNode): TemplateResult {
    return n.children
      ? html`<li role="treeitem" aria-expanded="true"><strong>${n.title}</strong><ul role="group" class="plain">${n.children.map((c) => this.node(c))}</ul></li>`
      : html`<li role="treeitem" class="row"><a class="grow" href=${n.url ?? '#'}>${n.title || n.url}</a><button aria-label=${this.t('bookmarks.remove', { title: n.title })} @click=${() => this.removeItem(n.id)}>${this.t('common.remove')}</button></li>`;
  }
  protected body(): TemplateResult {
    return this.nodes.length === 0 ? html`<p class="muted">${this.t('bookmarks.empty')}</p>` : html`<ul role="tree" class="plain" aria-label=${this.t('bookmarks.title')}>${this.nodes.map((n) => this.node(n))}</ul>`;
  }
}
customElements.define('corvid-bookmarks', CorvidBookmarks);
