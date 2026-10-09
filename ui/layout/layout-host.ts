// <cv-layout-host>: renders a Layout with CSS grid/flex (no absolute-pixel layout) and provides edit mode.
// The content area is a stable <slot name="content">: layout changes only move chrome elements, never the
// web content host, so content frames are not reloaded. Slot elements are cached by slot id and re-parented.
// UNVERIFIED in a real browser (no DOM tests in this environment); logic lives in ops/store/dnd which are tested.
import { LitElement, css, html, nothing, type TemplateResult } from 'lit';
import { baseStyles } from '../components/base.ts';
import { t } from '../i18n/index.ts';
import { REGION_IDS, type Layout, type RegionId, type SlotInstance, type Size } from './model.ts';
import { dropTarget, type DropInput } from './dnd.ts';
import { moveSlot, nudgeSlot, resizeSlot, setVisible, addComponent } from './ops.ts';
import type { LayoutStore } from './store.ts';

export class CvLayoutHost extends LitElement {
  static override properties = {
    store: { attribute: false },
    editing: { state: true },
    revision: { state: true },
    dropHint: { state: true },
  };
  declare store: LayoutStore | undefined;
  declare editing: boolean;
  declare revision: number;
  declare dropHint: { region: RegionId; x: number; y: number; w: number; h: number } | undefined;

  private elements = new Map<string, HTMLElement>();
  private unsubs: Array<() => void> = [];

  constructor() {
    super();
    this.editing = false;
    this.revision = 0;
  }

  static override styles = [baseStyles, css`
    :host { display: block; height: 100%; background: var(--cv-color-surface); }
    .grid {
      display: grid; height: 100%;
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-rows: auto minmax(0, 1fr) auto;
      grid-template-areas: "top top top" "left content right" "bottom bottom bottom";
    }
    .region { display: flex; min-width: 0; min-height: 0; background: var(--cv-color-surface-container); }
    .region.top { grid-area: top; flex-direction: column; }
    .region.bottom { grid-area: bottom; flex-direction: column; }
    .region.left { grid-area: left; flex-direction: column; width: var(--region-size, auto); }
    .region.right { grid-area: right; flex-direction: column; width: var(--region-size, auto); }
    .region.collapsed { display: none; }
    .row { display: flex; align-items: center; min-width: 0; gap: 0.25rem; padding: 0.125rem 0.5rem; }
    .slot { position: relative; min-width: 0; display: flex; }
    .slot.hidden { display: none; }
    .slot.is-addressbar { flex: 1 1 0; }
    .content { grid-area: content; position: relative; min-width: 0; min-height: 0; background: var(--cv-color-surface-container-lowest); border-radius: var(--cv-shape-medium); overflow: hidden; }
    .floating { position: absolute; inset: 0; pointer-events: none; }
    .floating .slot { position: absolute; pointer-events: auto; box-shadow: var(--cv-elevation-level2); border-radius: var(--cv-shape-large); background: var(--cv-color-surface-container-high); }
    /* edit mode */
    :host([editing]) .slot { outline: 2px dashed var(--cv-color-outline); outline-offset: -2px; border-radius: var(--cv-shape-small); }
    :host([editing]) .slot.hidden { display: flex; opacity: 0.45; }
    :host([editing]) .region { min-width: 2.5rem; min-height: 2rem; outline: 1px dotted var(--cv-color-outline-variant); }
    .handles { position: absolute; inset-block-start: 0; inset-inline-end: 0; z-index: 2; display: flex; gap: 0.125rem; background: var(--cv-color-secondary-container); color: var(--cv-color-on-secondary-container); border-radius: var(--cv-shape-small); }
    .handles button { min-height: 1.5rem; padding: 0 0.375rem; font-size: 0.75rem; }
    .resize { position: absolute; inset-inline-end: 0; inset-block: 0; width: 0.5rem; cursor: ew-resize; z-index: 2; background: var(--cv-color-primary); opacity: 0.4; }
    .drop-hint { position: fixed; z-index: 10; background: var(--cv-color-primary); opacity: 0.5; border-radius: var(--cv-shape-extra-small); pointer-events: none; }
    .edit-bar { position: fixed; inset-block-end: 1rem; inset-inline: 0; margin-inline: auto; width: fit-content; max-width: calc(100% - 2rem); z-index: 20; display: flex; flex-wrap: wrap; gap: 0.25rem; padding: 0.5rem; align-items: center; background: var(--cv-color-inverse-surface); color: var(--cv-color-inverse-on-surface); border-radius: var(--cv-shape-extra-large); box-shadow: var(--cv-elevation-level3); }
    .edit-bar button { color: inherit; }
    .palette { display: flex; gap: 0.25rem; flex-wrap: wrap; }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.bindStore();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
  override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('store')) this.bindStore();
  }

  private bindStore(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    const s = this.store;
    if (!s) return;
    this.editing = s.editMode;
    this.toggleAttribute('editing', this.editing);
    this.unsubs.push(s.subscribe(() => { this.revision++; }));
    this.unsubs.push(s.onEditMode((e) => { this.editing = e; this.toggleAttribute('editing', e); }));
  }

  private elementFor(slot: SlotInstance): HTMLElement {
    let el = this.elements.get(slot.id);
    if (!el || el.localName !== slot.component) {
      el = document.createElement(customElements.get(slot.component) ? slot.component : 'div');
      if (el.localName === 'div') el.textContent = slot.component; // component not loaded (yet)
      this.elements.set(slot.id, el);
    }
    return el;
  }

  private sizeStyle(slot: SlotInstance, region: RegionId): string {
    const s = slot.size;
    if (!s) return '';
    const bar = region === 'top' || region === 'bottom';
    if (s.unit === 'fr') return `flex:${s.value} 1 0;`;
    const v = s.unit === 'rem' ? `${s.value}rem` : `${s.value}%`;
    if (region === 'floating') return `width:${v};`;
    return bar ? `flex:0 0 ${v};` : `height:${v};`;
  }

  private regionSize(l: Layout, region: RegionId): string {
    const r = l.regions[region];
    if (region !== 'left' && region !== 'right') return '';
    const own: Size | undefined = r.size;
    const rems = r.slots.filter((s) => s.visible && s.size?.unit === 'rem').map((s) => s.size!.value);
    const v = own ? `${own.value}${own.unit === 'rem' ? 'rem' : own.unit}` : rems.length ? `${Math.max(...rems)}rem` : 'auto';
    return `--region-size:${v};`;
  }

  override render(): TemplateResult | typeof nothing {
    const store = this.store;
    if (!store) return nothing;
    const l = store.layout;
    return html`
      <div class="grid" role="presentation">
        ${REGION_IDS.filter((r) => r !== 'floating').map((r) => this.renderRegion(l, r))}
        <div class="content"><slot name="content"></slot></div>
        <div class="floating" data-region="floating">${l.regions.floating.slots.map((s) => this.renderSlot(s, 'floating'))}</div>
      </div>
      ${this.editing ? this.renderEditBar(store) : nothing}
      ${this.dropHint ? html`<div class="drop-hint" style="left:${this.dropHint.x}px;top:${this.dropHint.y}px;width:${this.dropHint.w}px;height:${this.dropHint.h}px"></div>` : nothing}
    `;
  }

  private renderRegion(l: Layout, region: RegionId): TemplateResult {
    const r = l.regions[region];
    const bar = region === 'top' || region === 'bottom';
    const groups: SlotInstance[][] = [];
    if (bar) {
      for (const s of r.slots) {
        const g = groups.at(-1);
        if (g && (g[0]!.row ?? 0) === (s.row ?? 0)) g.push(s); else groups.push([s]);
      }
    }
    const anyVisible = r.slots.some((s) => s.visible);
    const cls = `region ${region}${r.collapsed || (!anyVisible && !this.editing) ? ' collapsed' : ''}`;
    return html`
      <div class=${cls} data-region=${region} style=${this.regionSize(l, region)} role=${bar ? 'toolbar' : 'group'} aria-label=${t(`layout.region.${region}`)}>
        ${bar ? groups.map((g) => html`<div class="row">${g.map((s) => this.renderSlot(s, region))}</div>`) : r.slots.map((s) => this.renderSlot(s, region))}
      </div>`;
  }

  private renderSlot(slot: SlotInstance, region: RegionId): TemplateResult {
    const info = this.store!.catalog.get(slot.component);
    const el = this.elementFor(slot);
    const style = `${this.sizeStyle(slot, region)}${region === 'floating' && slot.position ? `left:${slot.position.x * 100}%;top:${slot.position.y * 100}%;` : ''}`;
    const cls = `slot${slot.visible ? '' : ' hidden'}${info?.role === 'addressbar' ? ' is-addressbar' : ''}`;
    return html`<div class=${cls} style=${style} data-slot=${slot.id} data-region=${region} tabindex=${this.editing ? 0 : -1}
        @keydown=${(e: KeyboardEvent) => this.onSlotKey(e, slot)}>
      ${el}
      ${this.editing ? this.renderHandles(slot, info?.movable ?? true, info?.hideable ?? true, info?.resizable ?? false) : nothing}
    </div>`;
  }

  private renderHandles(slot: SlotInstance, movable: boolean, hideable: boolean, resizable: boolean): TemplateResult {
    return html`
      <div class="handles">
        ${movable ? html`<button class="icon" title=${t('layout.edit.move')} aria-label=${t('layout.edit.move')} @pointerdown=${(e: PointerEvent) => this.startDrag(e, slot)}>&#x2725;</button>` : nothing}
        ${hideable ? html`<button class="icon" title=${slot.visible ? t('layout.edit.hide') : t('layout.edit.show')} aria-label=${slot.visible ? t('layout.edit.hide') : t('layout.edit.show')}
            @click=${() => this.store!.apply((l, c) => setVisible(l, c, slot.id, !slot.visible))}>${slot.visible ? '\u{1F441}' : '∅'}</button>` : nothing}
      </div>
      ${resizable ? html`<div class="resize" role="separator" aria-orientation="vertical" aria-label=${t('layout.edit.resize')} @pointerdown=${(e: PointerEvent) => this.startResize(e, slot)}></div>` : nothing}`;
  }

  private renderEditBar(store: LayoutStore): TemplateResult {
    const inLayout = new Set(store.layout.regions.top.slots.concat(...REGION_IDS.map((r) => store.layout.regions[r].slots)).map((s) => s.component));
    const available = [...store.catalog.values()].filter((c) => !inLayout.has(c.component));
    return html`
      <div class="edit-bar" role="region" aria-label=${t('layout.edit.title')}>
        <strong>${t('layout.edit.title')}</strong>
        <button ?disabled=${!store.canUndo} @click=${() => store.undo()}>${t('layout.edit.undo')}</button>
        <button ?disabled=${!store.canRedo} @click=${() => store.redo()}>${t('layout.edit.redo')}</button>
        <button @click=${() => store.reset()}>${t('layout.edit.reset')}</button>
        ${available.length ? html`<span class="palette" role="group" aria-label=${t('layout.edit.palette')}>
          ${available.map((c) => html`<button class="tonal" @click=${() => store.apply((l, cat) => addComponent(l, cat, c.component))}>+ ${c.title.startsWith('i18n:') ? t(c.title.slice(5)) : c.title}</button>`)}
        </span>` : nothing}
        <button class="filled" @click=${() => store.setEditMode(false)}>${t('layout.edit.done')}</button>
      </div>`;
  }

  // ---- interaction ----

  private onSlotKey(e: KeyboardEvent, slot: SlotInstance): void {
    if (!this.editing || !e.altKey) return;
    const s = this.store!;
    const map: Record<string, () => void> = {
      ArrowLeft: () => s.apply((l, c) => nudgeSlot(l, c, slot.id, -1)),
      ArrowUp: () => s.apply((l, c) => nudgeSlot(l, c, slot.id, -1)),
      ArrowRight: () => s.apply((l, c) => nudgeSlot(l, c, slot.id, 1)),
      ArrowDown: () => s.apply((l, c) => nudgeSlot(l, c, slot.id, 1)),
    };
    const f = map[e.key];
    if (f) { e.preventDefault(); f(); }
  }

  private collectDropInput(dragging: string, x: number, y: number): DropInput {
    const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    const regions = {} as DropInput['regions'];
    for (const id of REGION_IDS) {
      const el = this.renderRoot.querySelector(`[data-region="${id}"].region, .floating[data-region="${id}"]`);
      regions[id] = el ? rect(el) : { left: 0, top: 0, right: 0, bottom: 0 };
    }
    const slots: DropInput['slots'] = [];
    const l = this.store!.layout;
    for (const id of REGION_IDS) for (const s of l.regions[id].slots) {
      const el = this.renderRoot.querySelector(`[data-slot="${CSS.escape(s.id)}"]`);
      if (el) slots.push({ id: s.id, region: id, row: s.row, rect: rect(el) });
    }
    return { regions, slots, dragging, point: { x, y } };
  }

  private startDrag(e: PointerEvent, slot: SlotInstance): void {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dt = dropTarget(this.collectDropInput(slot.id, ev.clientX, ev.clientY));
      if (!dt) { this.dropHint = undefined; return; }
      const r = this.renderRoot.querySelector(`[data-region="${dt.region}"].region, .floating[data-region="${dt.region}"]`)?.getBoundingClientRect();
      this.dropHint = r ? { region: dt.region, x: r.left, y: r.top, w: r.width, h: Math.min(r.height, 4) || 4 } : undefined;
    };
    const up = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', cancel);
      target.releasePointerCapture(ev.pointerId);
      const dt = dropTarget(this.collectDropInput(slot.id, ev.clientX, ev.clientY));
      this.dropHint = undefined;
      if (dt) this.store!.apply((l, c) => moveSlot(l, c, slot.id, dt.region, dt.index, { newRow: dt.newRow }));
    };
    const cancel = () => { this.dropHint = undefined; target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
  }

  private startResize(e: PointerEvent, slot: SlotInstance): void {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const host = handle.closest('.slot') as HTMLElement;
    const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const rtl = getComputedStyle(this).direction === 'rtl';
    const region = host.dataset['region'] as RegionId;
    const fromRight = region === 'right' ? -1 : 1;
    const start = host.getBoundingClientRect().width;
    const x0 = e.clientX;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) * fromRight * (rtl ? -1 : 1);
      this.store!.apply((l, c) => resizeSlot(l, c, slot.id, { unit: 'rem', value: Math.max(1, (start + dx) / rootFont) }));
    };
    const up = (ev: PointerEvent) => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.releasePointerCapture(ev.pointerId); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }
}

if (!customElements.get('cv-layout-host')) customElements.define('cv-layout-host', CvLayoutHost);
