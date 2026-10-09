// Shared base for Corvid WebUI custom elements. Styles consume --cv-* tokens only (no raw colors).
import { LitElement, css } from 'lit';
import { t } from '../i18n/index.ts';

export const baseStyles = css`
  :host { box-sizing: border-box; font-family: var(--cv-font-plain); color: var(--cv-color-on-surface); }
  *, *::before, *::after { box-sizing: inherit; }
  button {
    font: inherit; color: inherit; background: transparent; border: 0; cursor: pointer;
    border-radius: var(--cv-shape-full); padding: 0.375rem 0.75rem; min-height: 2rem;
    transition: background-color var(--cv-motion-duration-short) var(--cv-motion-easing-standard);
  }
  button:hover { background: color-mix(in srgb, var(--cv-color-on-surface) calc(var(--cv-state-hover) * 100%), transparent); }
  button:focus-visible, [tabindex]:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible, a:focus-visible {
    outline: 2px solid var(--cv-color-primary); outline-offset: 2px;
  }
  button.filled { background: var(--cv-color-primary); color: var(--cv-color-on-primary); }
  button.tonal { background: var(--cv-color-secondary-container); color: var(--cv-color-on-secondary-container); }
  button.icon { padding: 0; width: 2rem; height: 2rem; display: inline-grid; place-items: center; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

export class CvElement extends LitElement {
  /** Translate a catalog key. */
  protected t(key: string, params?: Record<string, string | number>): string {
    return t(key, params);
  }
}
