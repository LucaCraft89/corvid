// Sample Corvid UI mod (API v0): a side panel that lists open tabs.
// Plain ES module: no build step, so it can be installed into a running browser.
// Only the public ModuleContext is available; there is no raw Chromium access.

class SamplePanel extends HTMLElement {
  #ctx;
  #root;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.innerHTML = '<style>:host{display:block;padding:var(--cv-space-3,0.75rem);color:var(--cv-color-on-surface);background:var(--cv-color-surface-container)}</style><ul part="list"></ul>';
  }

  bind(ctx) {
    this.#ctx = ctx;
    void this.refresh();
    ctx.addDisposable(ctx.api.tabs.onChanged(() => void this.refresh()));
  }

  async refresh() {
    const tabs = await this.#ctx.api.tabs.list();
    const showUrls = this.#ctx.api.settings.get('samplePanel.showUrls');
    const ul = this.#root.querySelector('ul');
    ul.replaceChildren(...tabs.map((t) => {
      const li = document.createElement('li');
      li.textContent = showUrls ? `${t.title} (${t.url})` : t.title;
      return li;
    }));
  }
}

let panel;

export function onLoad(ctx) {
  if (!customElements.get('sample-panel')) customElements.define('sample-panel', SamplePanel);
  panel = document.createElement('sample-panel');
  panel.bind?.(ctx);
  ctx.api.settings.onChange(() => void panel?.refresh());
}

export function onUnload() {
  panel?.remove();
  panel = undefined;
}
