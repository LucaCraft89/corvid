// corvid://settings. Module settings are generated from manifests; layout section is always
// reachable (including corvid://settings/layout#reset) even if the chrome layout is broken.
import { css, html, type TemplateResult } from 'lit';
import { CvPage, pageStyles } from '../shared/page.ts';
import { resolveRef } from '../../i18n/index.ts';
import type { ModuleHost } from '../../modules/host.ts';
import { buildSections, coerce, parseSettingsRoute, SECTIONS, type Field, type SectionId } from './settings-model.ts';
import { pageApi } from '../shared/api.ts';
import { DEFAULT_ENGINES } from '../../chrome/omnibox.ts';

let hostRef: ModuleHost | undefined;
export function setSettingsHost(h: ModuleHost): void { hostRef = h; }

const MODULE_SECTION: Record<string, SectionId> = {
  'corvid.theme': 'appearance', 'corvid.layout': 'layout', 'corvid.privacy': 'privacy', 'corvid.drm': 'privacy',
};

export class CorvidSettings extends CvPage {
  static override properties = { section: { state: true }, errors: { state: true }, resetDone: { state: true } };
  declare section: SectionId;
  declare errors: Record<string, string>;
  declare resetDone: boolean;
  constructor() { super(); this.section = 'general'; this.errors = {}; this.resetDone = false; }
  static override styles = [pageStyles, css`
    .layout { display: grid; grid-template-columns: 12rem 1fr; gap: 1.5rem; }
    @media (max-width: 40rem) { .layout { grid-template-columns: 1fr; } }
    nav ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
    nav a { display: block; padding: 0.5rem 0.75rem; border-radius: var(--cv-shape-full); color: inherit; text-decoration: none; }
    nav a[aria-current=page] { background: var(--cv-color-secondary-container); color: var(--cv-color-on-secondary-container); }
    .field { display: grid; gap: 0.25rem; padding: 0.5rem 0; }
  `];
  override connectedCallback(): void {
    super.connectedCallback();
    const r = parseSettingsRoute(location.pathname, location.hash);
    this.section = r.section;
    if (r.action === 'reset-layout') void pageApi().settings.resetLayout().then(() => { this.resetDone = true; });
  }
  protected heading(): string { return this.t('settings.title'); }

  private async onChange(f: Field, raw: string | boolean) {
    const host = hostRef!;
    const decl = host.manifests().find((m) => m.id === f.moduleId)!.settings!.find((s) => s.key === f.key)!;
    const c = coerce(decl, raw);
    if (!c.ok) { this.errors = { ...this.errors, [f.key]: c.error }; return; }
    const { [f.key]: _drop, ...rest } = this.errors; void _drop;
    this.errors = rest;
    await host.setSetting(f.moduleId, f.key, c.value);
    this.requestUpdate();
  }

  private control(f: Field): TemplateResult {
    const label = resolveRef(f.labelRef);
    const id = `f-${f.key}`;
    const err = this.errors[f.key];
    const input = (() => {
      switch (f.control) {
        case 'switch': return html`<input id=${id} type="checkbox" role="switch" .checked=${f.value === true} @change=${(e: Event) => this.onChange(f, (e.target as HTMLInputElement).checked)}>`;
        case 'select': return html`<select id=${id} @change=${(e: Event) => this.onChange(f, (e.target as HTMLSelectElement).value)}>${f.options!.map((o) => html`<option value=${o} ?selected=${f.value === o}>${this.optionLabel(f.key, o)}</option>`)}</select>`;
        case 'number': return html`<input id=${id} type="number" min=${f.min ?? ''} max=${f.max ?? ''} .value=${String(f.value)} @change=${(e: Event) => this.onChange(f, (e.target as HTMLInputElement).value)}>`;
        case 'color': return html`<input id=${id} type="color" .value=${String(f.value)} @change=${(e: Event) => this.onChange(f, (e.target as HTMLInputElement).value)}>`;
        default: return html`<input id=${id} type="text" .value=${String(f.value ?? '')} @change=${(e: Event) => this.onChange(f, (e.target as HTMLInputElement).value)}>`;
      }
    })();
    return html`<div class="field"><label for=${id}>${label}</label>${input}${f.descriptionRef ? html`<span class="muted">${resolveRef(f.descriptionRef)}</span>` : ''}${err ? html`<span class="error" role="alert">${err}</span>` : ''}</div>`;
  }

  private optionLabel(key: string, value: string): string {
    const k = `option.${key}.${value}`;
    const r = this.t(k);
    return r === k ? value : r;
  }

  private sectionFor(secId: SectionId): TemplateResult {
    const host = hostRef;
    if (!host) return html``;
    const secs = buildSections(host.manifests(), (m, k) => host.getSetting(m, k)).filter((s) => (MODULE_SECTION[s.moduleId] ?? 'general') === secId);
    const extra = secId === 'layout' ? html`
      <div class="card"><div class="row">
        <button class="tonal" @click=${() => pageApi().settings.resetLayout().then(() => { this.resetDone = true; })}>${this.t('settings.layout.reset')}</button>
        ${this.resetDone ? html`<span role="status">${this.t('settings.layout.resetDone')}</span>` : ''}</div>
        <p class="muted">${this.t('settings.layout.shortcuts')}</p></div>`
      : secId === 'search' ? html`<ul class="plain">${DEFAULT_ENGINES.map((e) => html`<li class="card">${e.name} <span class="muted">${e.url}</span></li>`)}</ul>`
      : secId === 'extensions' ? html`<p><a href="corvid://extensions">${this.t('settings.extensions.open')}</a></p>`
      : secId === 'privacy' ? html`<p class="muted">${this.t('settings.privacy.webrtcHelp')}</p><p class="muted">${this.t('settings.drm.help')}</p>` : '';
    return html`${secs.map((s) => html`<section class="card" aria-label=${resolveRef(s.titleRef)}><h2>${resolveRef(s.titleRef)}</h2>${s.fields.map((f) => this.control(f))}</section>`)}${extra}`;
  }

  protected body(): TemplateResult {
    return html`<div class="layout">
      <nav aria-label=${this.t('settings.nav')}><ul>${SECTIONS.map((s) => html`<li><a href=${`corvid://settings/${s}`} aria-current=${s === this.section ? 'page' : 'false'} @click=${(e: Event) => { e.preventDefault(); this.section = s; }}>${this.t(`settings.section.${s}`)}</a></li>`)}</ul></nav>
      <div role="region" aria-label=${this.t(`settings.section.${this.section}`)}>${this.section === 'about' ? html`<a href="corvid://about">${this.t('about.title')}</a>` : this.sectionFor(this.section)}</div>
    </div>`;
  }
}
customElements.define('corvid-settings', CorvidSettings);
