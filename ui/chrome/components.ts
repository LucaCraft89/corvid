// Builtin chrome components (tab strip, toolbar, address bar, bookmarks bar, side panel host,
// extension actions, layout menu). UNVERIFIED in a browser; logic with tests lives in omnibox.ts / layout/.
import { css, html, nothing, type TemplateResult } from 'lit';
import { baseStyles, CvElement } from '../components/base.ts';
import { bridge, type BookmarkItem, type ExtensionAction, type NavState, type Tab } from './bridge.ts';
import { classifyInput } from './omnibox.ts';

abstract class Live extends CvElement {
  private off: Array<() => void> = [];
  protected abstract subscribe(): Array<() => void>;
  protected abstract refresh(): Promise<void>;
  override connectedCallback(): void { super.connectedCallback(); this.off = this.subscribe(); void this.refresh(); }
  override disconnectedCallback(): void { super.disconnectedCallback(); this.off.forEach((o) => o()); this.off = []; }
}

export class CorvidTabstrip extends Live {
  static override properties = { tabs: { state: true } };
  declare tabs: Tab[];
  constructor() { super(); this.tabs = []; }
  static override styles = [baseStyles, css`
    :host { display: flex; flex: 1 1 0; min-width: 0; }
    [role=tablist] { display: flex; gap: 0.25rem; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
    :host([vertical]) [role=tablist] { flex-direction: column; overflow-y: auto; overflow-x: hidden; }
    [role=tab] { display: flex; align-items: center; gap: 0.5rem; flex: 0 1 12rem; min-width: 2.5rem; padding: 0.25rem 0.5rem; border-radius: var(--cv-shape-medium); cursor: pointer; }
    [role=tab][aria-selected=true] { background: var(--cv-color-secondary-container); color: var(--cv-color-on-secondary-container); }
    [role=tab] span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-size: var(--cv-type-label-large-size); }
  `];
  protected subscribe() { return [bridge().tabs.onChanged(() => void this.refresh())]; }
  protected async refresh() { this.tabs = await bridge().tabs.list(); }
  private onKey(e: KeyboardEvent, i: number) {
    const vertical = this.hasAttribute('vertical');
    const next = e.key === (vertical ? 'ArrowDown' : 'ArrowRight') ? i + 1 : e.key === (vertical ? 'ArrowUp' : 'ArrowLeft') ? i - 1 : undefined;
    if (next === undefined || !this.tabs[next]) return;
    e.preventDefault();
    void bridge().tabs.activate(this.tabs[next]!.id);
  }
  override render(): TemplateResult {
    return html`<div role="tablist" aria-label=${this.t('tabstrip.label')} aria-orientation=${this.hasAttribute('vertical') ? 'vertical' : 'horizontal'}>
      ${this.tabs.map((tab, i) => html`<div role="tab" tabindex=${tab.active ? 0 : -1} aria-selected=${tab.active} title=${tab.title}
          @click=${() => bridge().tabs.activate(tab.id)} @keydown=${(e: KeyboardEvent) => this.onKey(e, i)}
          @auxclick=${(e: MouseEvent) => { if (e.button === 1) void bridge().tabs.close(tab.id); }}>
        <span>${tab.title || tab.url}</span>
        <button class="icon" aria-label=${this.t('tabstrip.close', { title: tab.title })} @click=${(e: Event) => { e.stopPropagation(); void bridge().tabs.close(tab.id); }}>&times;</button>
      </div>`)}
      <button class="icon" aria-label=${this.t('tabstrip.new')} @click=${() => bridge().tabs.create()}>+</button>
    </div>`;
  }
}

export class CorvidToolbar extends Live {
  static override properties = { nav: { state: true } };
  declare nav: NavState | undefined;
  static override styles = [baseStyles, css`:host { display: flex; gap: 0.125rem; }`];
  protected subscribe() { return [bridge().nav.onChanged(() => void this.refresh())]; }
  protected async refresh() { this.nav = await bridge().nav.state(); }
  override render(): TemplateResult {
    const n = this.nav;
    return html`
      <button class="icon" ?disabled=${!n?.canGoBack} aria-label=${this.t('toolbar.back')} @click=${() => bridge().nav.back()}>&#x2190;</button>
      <button class="icon" ?disabled=${!n?.canGoForward} aria-label=${this.t('toolbar.forward')} @click=${() => bridge().nav.forward()}>&#x2192;</button>
      <button class="icon" aria-label=${n?.loading ? this.t('toolbar.stop') : this.t('toolbar.reload')} @click=${() => bridge().nav.reload()}>${n?.loading ? '×' : '↻'}</button>`;
  }
}

export class CorvidAddressbar extends Live {
  static override properties = { nav: { state: true } };
  declare nav: NavState | undefined;
  static override styles = [baseStyles, css`
    :host { display: flex; flex: 1 1 0; min-width: 0; }
    input { flex: 1; min-width: 0; font: inherit; color: inherit; background: var(--cv-color-surface-container-highest); border: 0; border-radius: var(--cv-shape-full); padding: 0.375rem 1rem; }
  `];
  protected subscribe() { return [bridge().nav.onChanged(() => void this.refresh())]; }
  protected async refresh() { this.nav = await bridge().nav.state(); }
  private submit(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const c = classifyInput((e.target as HTMLInputElement).value);
    if (c.kind !== 'empty') void bridge().nav.navigate(c.url);
  }
  override render(): TemplateResult {
    return html`<input type="text" role="combobox" aria-label=${this.t('addressbar.label')} placeholder=${this.t('addressbar.placeholder')}
      .value=${this.nav?.url ?? ''} spellcheck="false" autocomplete="off" @keydown=${this.submit}>`;
  }
}

export class CorvidBookmarksbar extends Live {
  static override properties = { items: { state: true } };
  declare items: BookmarkItem[];
  constructor() { super(); this.items = []; }
  static override styles = [baseStyles, css`:host { display: flex; gap: 0.25rem; overflow-x: auto; flex: 1; } a { color: inherit; text-decoration: none; padding: 0.25rem 0.5rem; border-radius: var(--cv-shape-small); white-space: nowrap; font-size: var(--cv-type-label-large-size); } a:hover { background: var(--cv-color-surface-container-high); }`];
  protected subscribe() { return []; }
  protected async refresh() { this.items = await bridge().bookmarks.list(); }
  override render(): TemplateResult {
    return html`${this.items.length ? this.items.map((b) => html`<a href=${b.url} @click=${(e: Event) => { e.preventDefault(); void bridge().nav.navigate(b.url); }}>${b.title}</a>`) : html`<span>${this.t('bookmarksbar.empty')}</span>`}`;
  }
}

export class CorvidSidepanel extends CvElement {
  static override styles = [baseStyles, css`:host { display: block; flex: 1; min-width: 0; overflow: auto; background: var(--cv-color-surface-container-low); border-radius: var(--cv-shape-medium); } ::slotted(*) { display: block; }`];
  override render(): TemplateResult { return html`<div role="complementary" aria-label=${this.t('sidepanel.label')}><slot>${this.t('sidepanel.empty')}</slot></div>`; }
}

export class CorvidExtensionActions extends Live {
  static override properties = { actions: { state: true } };
  declare actions: ExtensionAction[];
  constructor() { super(); this.actions = []; }
  static override styles = [baseStyles, css`:host { display: flex; gap: 0.125rem; } img { width: 1.25rem; height: 1.25rem; }`];
  protected subscribe() { return [bridge().extensions.onChanged(() => void this.refresh())]; }
  protected async refresh() { this.actions = await bridge().extensions.actions(); }
  override render(): TemplateResult {
    return html`${this.actions.map((a) => html`<button class="icon" title=${a.name} aria-label=${a.name} @click=${() => bridge().extensions.trigger(a.id)}><img src=${a.iconUrl} alt="">${a.badge ? html`<span class="sr-only">${a.badge}</span>` : nothing}</button>`)}`;
  }
}

/** Menu with the always-reachable entry points: edit layout, reset layout, settings. */
export class CorvidLayoutMenu extends CvElement {
  static override styles = [baseStyles, css`:host { display: flex; } menu { margin: 0; padding: 0.25rem; list-style: none; position: absolute; z-index: 30; background: var(--cv-color-surface-container-high); border-radius: var(--cv-shape-large); box-shadow: var(--cv-elevation-level2); } `];
  static override properties = { open: { state: true } };
  declare open: boolean;
  constructor() { super(); this.open = false; }
  private fire(name: string) { this.open = false; this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true })); }
  override render(): TemplateResult {
    return html`<button class="icon" aria-haspopup="menu" aria-expanded=${this.open} aria-label=${this.t('layoutmenu.label')} @click=${() => { this.open = !this.open; }}>&#x22EE;</button>
      ${this.open ? html`<menu role="menu">
        <li role="none"><button role="menuitem" @click=${() => this.fire('cv-edit-layout')}>${this.t('layoutmenu.edit')}</button></li>
        <li role="none"><button role="menuitem" @click=${() => this.fire('cv-reset-layout')}>${this.t('layoutmenu.reset')}</button></li>
        <li role="none"><button role="menuitem" @click=${() => this.fire('cv-open-settings')}>${this.t('layoutmenu.settings')}</button></li>
      </menu>` : nothing}`;
  }
}

const defs: Record<string, CustomElementConstructor> = {
  'corvid-tabstrip': CorvidTabstrip, 'corvid-toolbar': CorvidToolbar, 'corvid-addressbar': CorvidAddressbar,
  'corvid-bookmarksbar': CorvidBookmarksbar, 'corvid-sidepanel': CorvidSidepanel,
  'corvid-extension-actions': CorvidExtensionActions, 'corvid-layout-menu': CorvidLayoutMenu,
};
for (const [tag, ctor] of Object.entries(defs)) if (!customElements.get(tag)) customElements.define(tag, ctor);
