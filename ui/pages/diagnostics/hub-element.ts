// <corvid-diagnostics-hub>: thin DOM binding over HubModel. UNVERIFIED (no DOM/browser in sandbox).
// textContent only (no innerHTML): event data is untrusted page-derived text. Theme tokens via CSS vars.
// A11y: landmark roles, labelled controls, a live region for new events. To be re-skinned with Lit
// once Phase 1's component base lands; logic stays in hub-model.ts.
import { HubModel } from './hub-model.ts';
import type { DiagnosticsBackend } from './hub-model.ts';
import { ALL_KINDS } from '../../diagnostics/types.ts';
import { t } from './i18n.ts';

export class CorvidDiagnosticsHub extends HTMLElement {
  model!: HubModel;
  connect(backend: DiagnosticsBackend) { this.model = new HubModel(backend); this.model.onChange = () => this.render(); return this.model.start(); }
  disconnectedCallback() { this.model?.stop(); }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag); if (text) e.textContent = text;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  render() {
    const root = this.el('main', '', { 'aria-label': t('diag.title') });
    root.append(this.el('h1', t('diag.title')), this.el('p', t('diag.local')));
    const kind = this.el('select', '', { 'aria-label': t('diag.filter.kind') });
    kind.append(new Option(t('diag.filter.kind'), ''));
    for (const k of ALL_KINDS) kind.append(new Option(t('kind.' + k), k));
    kind.onchange = () => this.model.setFilter({ kinds: kind.value ? [kind.value as any] : undefined });
    const search = this.el('input', '', { type: 'search', 'aria-label': t('diag.filter.search') });
    search.onchange = () => this.model.setFilter({ text: search.value || undefined });
    const list = this.el('ul', '', { 'aria-live': 'polite' });
    if (!this.model.events.length) list.append(this.el('li', t('diag.empty')));
    for (const e of [...this.model.events].reverse()) {
      list.append(this.el('li', `${new Date(e.ts).toISOString()}  ${t('kind.' + e.kind)}  [${e.severity}]  tab ${e.tabId ?? '-'}`));
    }
    const exp = this.el('button', t('diag.export')); exp.onclick = () => this.model.beginExport();
    root.append(kind, search, exp, list);
    const st = this.model.exportState;
    if (st) {
      const redact = this.el('input', '', { type: 'checkbox', id: 'redact' }); redact.checked = this.model.redact;
      redact.onchange = () => this.model.toggleRedact(redact.checked);
      const lab = this.el('label', t('diag.export.redact'), { for: 'redact' });
      const files = this.el('ul'); for (const f of st.preview.files) files.append(this.el('li', `${f.name} (${f.bytes} B, sha256 ${f.sha256.slice(0, 12)})`));
      const ok = this.el('button', t('diag.export.confirm')); ok.onclick = () => this.model.confirmExport();
      root.append(this.el('h2', t('diag.export.preview')), redact, lab, files);
      if (st.preview.excluded.length) { root.append(this.el('p', t('diag.export.excluded'))); const x = this.el('ul'); for (const f of st.preview.excluded) x.append(this.el('li', `${f.name}: ${f.reason}`)); root.append(x); }
      root.append(ok);
    }
    this.replaceChildren(root);
  }
}
if (typeof customElements !== 'undefined') customElements.define('corvid-diagnostics-hub', CorvidDiagnosticsHub);
