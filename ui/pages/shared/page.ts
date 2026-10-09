// Base for full-page WebUI pages: tokens, landmarks, live theme.
import { css, html, type CSSResultGroup, type TemplateResult } from 'lit';
import { baseStyles, CvElement } from '../../components/base.ts';

export const pageStyles = [baseStyles, css`
  :host { display: block; min-height: 100vh; background: var(--cv-color-surface); color: var(--cv-color-on-surface); font-size: var(--cv-type-body-large-size); line-height: var(--cv-type-body-large-line); }
  main { max-width: 60rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
  h1 { font-size: var(--cv-type-emphasized-headline-large-size); font-weight: var(--cv-type-emphasized-headline-large-weight); margin: 0 0 1rem; }
  h2 { font-size: var(--cv-type-emphasized-title-large-size); font-weight: var(--cv-type-emphasized-title-large-weight); margin: 1.5rem 0 0.5rem; }
  .card { background: var(--cv-color-surface-container); border-radius: var(--cv-shape-large); padding: 1rem; margin: 0.5rem 0; }
  .muted { color: var(--cv-color-on-surface-variant); }
  .row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .grow { flex: 1; min-width: 0; }
  input[type=search], input[type=text], select { font: inherit; color: inherit; background: var(--cv-color-surface-container-highest); border: 1px solid var(--cv-color-outline-variant); border-radius: var(--cv-shape-medium); padding: 0.5rem 0.75rem; }
  ul.plain { list-style: none; margin: 0; padding: 0; }
  a { color: var(--cv-color-primary); }
  details { margin: 0.5rem 0; } summary { cursor: pointer; }
  pre { overflow: auto; background: var(--cv-color-surface-container-highest); border-radius: var(--cv-shape-small); padding: 0.75rem; font-family: var(--cv-font-mono); font-size: var(--cv-type-body-small-size); }
  .error { color: var(--cv-color-error); }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: start; padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--cv-color-outline-variant); }
`];

export abstract class CvPage extends CvElement {
  static override styles: CSSResultGroup = pageStyles;
  protected abstract heading(): string;
  protected abstract body(): TemplateResult;
  override render(): TemplateResult {
    return html`<main><h1>${this.heading()}</h1>${this.body()}</main>`;
  }
}
