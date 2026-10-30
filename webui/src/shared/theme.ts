// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Applies colour, density and theme mode to a page.

import { checkPalette, makePalette, paletteToCss, type Palette } from '../color/engine.js';
import type { Prefs } from './prefs.js';

export interface ThemeCss {
  css: string;
  light: Palette;
  dark: Palette;
}

/** CSS for the colour part of the prefs: light, dark, and the switch between them. */
export function themeCss(p: Pick<Prefs, 'seed' | 'contrast' | 'style' | 'themeMode'>): ThemeCss {
  const opts = { seed: p.seed, contrast: p.contrast, style: p.style };
  const light = makePalette({ ...opts, dark: false });
  const dark = makePalette({ ...opts, dark: true });
  const l = paletteToCss(light);
  const d = paletteToCss(dark);
  let css: string;
  if (p.themeMode === 'light') css = `:root { color-scheme: light; ${l} }`;
  else if (p.themeMode === 'dark') css = `:root { color-scheme: dark; ${d} }`;
  else css = `:root { color-scheme: light dark; ${l} }\n@media (prefers-color-scheme: dark) { :root { ${d} } }`;
  return { css, light, dark };
}

/** Number of colour pairs below WCAG AA in either mode. */
export function themeIssueCount(t: ThemeCss): number {
  return checkPalette(t.light).length + checkPalette(t.dark).length;
}

let sheet: CSSStyleSheet | null = null;

/**
 * Applies prefs to the document. Uses a constructed stylesheet, which
 * WebUI's content security policy allows (no inline <style>).
 */
export function applyTheme(p: Prefs, doc: Document = document): void {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  }
  sheet.replaceSync(themeCss(p).css);
  doc.documentElement.dataset['density'] = p.density;
  doc.documentElement.dataset['themeMode'] = p.themeMode;
}
