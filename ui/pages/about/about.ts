import { html, type TemplateResult } from 'lit';
import { CvPage } from '../shared/page.ts';
import { pageApi, type AboutInfo } from '../shared/api.ts';

export class CorvidAbout extends CvPage {
  static override properties = { info: { state: true } };
  declare info: AboutInfo | undefined;
  override async connectedCallback(): Promise<void> { super.connectedCallback(); this.info = await pageApi().about.info(); }
  protected heading(): string { return this.info ? `${this.info.name} ${this.info.version}` : this.t('about.title'); }
  protected body(): TemplateResult {
    const i = this.info;
    if (!i) return html`<p class="muted">${this.t('common.loading')}</p>`;
    return html`
      <table><tbody>
        <tr><th scope="row">${this.t('about.version')}</th><td>${i.version}</td></tr>
        <tr><th scope="row">${this.t('about.chromium')}</th><td>${i.chromiumVersion}</td></tr>
        <tr><th scope="row">${this.t('about.revision')}</th><td>${i.revision}</td></tr>
        <tr><th scope="row">${this.t('about.os')}</th><td>${i.os}</td></tr>
        <tr><th scope="row">${this.t('about.profile')}</th><td>${i.profilePath}</td></tr>
      </tbody></table>
      <p>${this.t('about.privacy')}</p>
      <h2>${this.t('about.credits')}</h2>
      <p class="muted">${this.t('about.creditsIntro')}</p>
      <ul>${i.licenses.map((l) => html`<li>${l.name}: ${l.license}</li>`)}</ul>`;
  }
}
customElements.define('corvid-about', CorvidAbout);
