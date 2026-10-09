// corvid://newtab. If an extension overrides the new tab, the native hook (ntp_override) loads the
// extension page instead; this page is the fallback and also handles `?default`.
import { css, html, type TemplateResult } from 'lit';
import { CvPage, pageStyles } from '../shared/page.ts';
import { pageApi, type TopSite } from '../shared/api.ts';

export class CorvidNewtab extends CvPage {
  static override properties = { sites: { state: true } };
  declare sites: TopSite[];
  constructor() { super(); this.sites = []; }
  static override styles = [pageStyles, css`
    main { display: grid; justify-items: center; align-content: start; padding-top: 12vh; }
    form { width: min(36rem, 100%); }
    input[type=search] { width: 100%; border-radius: var(--cv-shape-full); padding: 0.75rem 1.25rem; }
    ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr)); gap: 0.75rem; width: min(40rem, 100%); margin-top: 2rem; }
    li a { display: grid; justify-items: center; gap: 0.5rem; padding: 0.75rem; border-radius: var(--cv-shape-extra-large); color: var(--cv-color-on-surface); text-decoration: none; background: var(--cv-color-surface-container); }
    li a:hover, li a:focus-visible { background: var(--cv-color-secondary-container); }
    .tile { width: 2.5rem; height: 2.5rem; border-radius: var(--cv-shape-full); background: var(--cv-color-primary-container); color: var(--cv-color-on-primary-container); display: grid; place-items: center; font-weight: 600; }
    h1 { font-size: var(--cv-type-emphasized-display-small-size); }
  `];
  override async connectedCallback(): Promise<void> {
    super.connectedCallback();
    this.sites = await pageApi().newtab.topSites();
  }
  protected heading(): string { return this.t('app.name'); }
  protected body(): TemplateResult {
    return html`
      <form role="search" action="corvid://search" @submit=${(e: Event) => { e.preventDefault(); }}>
        <input type="search" name="q" aria-label=${this.t('newtab.search')} placeholder=${this.t('newtab.search')} autofocus>
      </form>
      <nav aria-label=${this.t('newtab.topSites')}>
        <ul class="plain">${this.sites.map((s) => html`<li><a href=${s.url}><span class="tile" aria-hidden="true">${(s.title || s.url).charAt(0).toUpperCase()}</span><span>${s.title}</span></a></li>`)}</ul>
      </nav>`;
  }
}
customElements.define('corvid-newtab', CorvidNewtab);
