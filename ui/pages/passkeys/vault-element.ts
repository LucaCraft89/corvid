// <corvid-passkeys>: thin DOM binding over VaultModel. UNVERIFIED (no DOM/browser in sandbox).
// Passphrase inputs are type=password with autocomplete=off and are cleared right after use.
import { VaultModel } from './vault-model.ts';
import type { VaultBackend } from './vault-model.ts';
import { t } from '../diagnostics/i18n.ts';

export class CorvidPasskeys extends HTMLElement {
  model!: VaultModel;
  connect(b: VaultBackend) { this.model = new VaultModel(b); this.model.onChange = () => this.render(); this.render(); }
  private mk<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', a: Record<string, string> = {}) {
    const e = document.createElement(tag); if (text) e.textContent = text; for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e;
  }
  private pass(label: string) { const i = this.mk('input', '', { type: 'password', autocomplete: 'off', 'aria-label': label }); return i; }
  render() {
    const m = this.model; const root = this.mk('main', '', { 'aria-label': t('passkeys.title') });
    root.append(this.mk('h1', t('passkeys.title')));
    if (m.error) root.append(this.mk('p', m.error, { role: 'alert' }));
    if (m.screen === 'create') {
      const a = this.pass(t('passkeys.create.passphrase')), b = this.pass(t('passkeys.create.confirm'));
      const go = this.mk('button', t('passkeys.create.title')); go.onclick = async () => { await m.create(a.value, b.value); a.value = b.value = ''; };
      root.append(a, b, go);
    } else if (m.screen === 'locked') {
      const a = this.pass(t('passkeys.passphrase'));
      const go = this.mk('button', t('passkeys.unlock')); go.onclick = async () => { await m.unlock(a.value); a.value = ''; };
      root.append(this.mk('p', t('passkeys.locked')), a, go);
    } else {
      const lock = this.mk('button', t('passkeys.lock')); lock.onclick = () => m.lock();
      root.append(lock);
      if (!m.items.length) root.append(this.mk('p', t('passkeys.empty')));
      const ul = this.mk('ul');
      for (const c of m.sorted()) {
        const li = this.mk('li', `${c.label ?? c.rpId} - ${c.userName} (${c.rpId})`);
        const del = this.mk('button', t('passkeys.delete')); del.onclick = () => m.delete(c.id, confirm(t('passkeys.delete.confirm')));
        const ren = this.mk('button', t('passkeys.rename')); ren.onclick = () => { const v = prompt(t('passkeys.rename'), c.label ?? ''); if (v !== null) m.rename(c.id, v); };
        li.append(ren, del); ul.append(li);
      }
      root.append(ul);
    }
    this.replaceChildren(root);
  }
}
if (typeof customElements !== 'undefined') customElements.define('corvid-passkeys', CorvidPasskeys);
