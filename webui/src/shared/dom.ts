// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Small DOM helpers. No innerHTML with data: everything goes through
// textContent so page content can never inject markup.

export function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
}

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Line icons drawn on a 24 px grid. */
const ICONS: Record<string, string[]> = {
  search: ['M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13z', 'M15.5 15.5L20 20'],
  add: ['M12 5v14', 'M5 12h14'],
  more: ['M12 5.5h.01', 'M12 12h.01', 'M12 18.5h.01'],
  tune: ['M4 7h10', 'M18 7h2', 'M16 5v4', 'M4 17h2', 'M10 17h10', 'M8 15v4'],
  back: ['M19 12H5', 'M11 6l-6 6l6 6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  copy: ['M9 9h10v10H9z', 'M5 15V5h10'],
  refresh: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v4h-4'],
  warning: ['M12 3l10 18H2z', 'M12 10v4', 'M12 17.5h.01'],
  offline: ['M3 3l18 18', 'M8.5 16.5a5 5 0 0 1 7 0', 'M5 12.5a10 10 0 0 1 4-2.3', 'M19 12.5a10 10 0 0 0-3.5-2.1', 'M2 8.8a15 15 0 0 1 4.3-2.6', 'M22 8.8a15 15 0 0 0-11-3.7', 'M12 20h.01'],
  lock: ['M6 11h12v10H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  globe: ['M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18z', 'M3 12h18', 'M12 3c3 3.5 3 14.5 0 18', 'M12 3c-3 3.5-3 14.5 0 18'],
  block: ['M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18z', 'M5.6 5.6l12.8 12.8'],
  clock: ['M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18z', 'M12 7v5l3 2'],
};

export function icon(name: keyof typeof ICONS | string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] ?? []) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

let snackTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows a short message at the bottom; screen readers hear it too. */
export function snackbar(text: string): void {
  let el = document.querySelector<HTMLElement>('.snackbar');
  if (!el) {
    el = h('div', { class: 'snackbar', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => el!.classList.remove('show'), 2500);
}

/** Replaces [data-icon="name"] placeholders in static markup with icons. */
export function applyIcons(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-icon]')) {
    el.replaceWith(icon(el.dataset['icon']!));
  }
}
