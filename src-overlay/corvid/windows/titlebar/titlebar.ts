// Custom title bar for the WebUI chrome (task 3.7). Pure logic; native glue is patch 0005
// (frameless window, WM_NCHITTEST, Window Controls Overlay). UNVERIFIED: no Windows run.
//
// Design:
//  - The chrome WebUI draws tabs/toolbar into the non-client area. The native shell hit-tests using
//    "drag regions" this module reports (everything draggable unless an interactive element or the
//    caption-button zone covers it).
//  - Caption buttons are NATIVE-hit-tested (HTMAXBUTTON) so Windows 11 snap layouts appear on hover;
//    WebUI only reserves space (inset) and paints the glyphs/hover state from native state events.
//  - Strings come from the i18n catalog keys below; no hard-coded UI text (AGENTS rule 7).

export interface Rect { x: number; y: number; width: number; height: number; }

/** Native -> WebUI: geometry of the caption button cluster, in DIPs (so 200% scaling needs no math here). */
export interface CaptionMetrics {
  insetRight: number;      // width reserved at the right edge (min+max+close)
  insetLeft: number;       // reserved if the system menu / mac-style left controls are used (0 on Windows)
  height: number;          // caption height; 32 DIP default, 40 on touch-optimized
  maximized: boolean;
  active: boolean;
  forcedColors: boolean;   // high-contrast: use system colors, draw borders
}

export type CaptionButton = 'minimize' | 'maximize' | 'restore' | 'close';

export const I18N_KEYS: Record<CaptionButton, string> = {
  minimize: 'window.minimize',
  maximize: 'window.maximize',
  restore: 'window.restore',
  close: 'window.close',
};

/** CSS custom properties applied on <corvid-titlebar>. Insets via env() are used when WCO is on. */
export function titlebarCssVars(m: CaptionMetrics): Record<string, string> {
  return {
    '--cv-caption-inset-right': `${m.insetRight}px`,
    '--cv-caption-inset-left': `${m.insetLeft}px`,
    '--cv-caption-height': `${m.height}px`,
    '--cv-titlebar-opacity': m.active ? '1' : '0.7',
  };
}

/**
 * Compute drag regions: the titlebar rect minus the caption-button zone minus every interactive rect
 * (tabs, buttons, omnibox). Result rects are what the native shell returns HTCAPTION for.
 * Subtraction is done on a horizontal band decomposition; interactive rects are clipped to the bar.
 */
export function computeDragRegions(bar: Rect, m: CaptionMetrics, interactive: Rect[]): Rect[] {
  const usableLeft = bar.x + m.insetLeft;
  const usableRight = bar.x + bar.width - m.insetRight;
  if (usableRight <= usableLeft) return [];
  const clipped = interactive
    .map((r) => ({
      x: Math.max(r.x, usableLeft),
      y: Math.max(r.y, bar.y),
      r: Math.min(r.x + r.width, usableRight),
      b: Math.min(r.y + r.height, bar.y + bar.height),
    }))
    .filter((r) => r.r > r.x && r.b > r.y);

  // Cut at every distinct y boundary, then merge x-intervals per band.
  const ys = [...new Set([bar.y, bar.y + bar.height, ...clipped.flatMap((r) => [r.y, r.b])])].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i], y1 = ys[i + 1];
    const cover = clipped.filter((r) => r.y <= y0 && r.b >= y1).sort((a, b) => a.x - b.x);
    let cursor = usableLeft;
    for (const c of cover) {
      if (c.x > cursor) out.push({ x: cursor, y: y0, width: c.x - cursor, height: y1 - y0 });
      cursor = Math.max(cursor, c.r);
    }
    if (cursor < usableRight) out.push({ x: cursor, y: y0, width: usableRight - cursor, height: y1 - y0 });
  }
  return out;
}

/** Maximized windows overhang the monitor by the resize border; pad content so nothing is clipped. */
export function maximizedPadding(maximized: boolean, resizeBorderDip: number): number {
  return maximized ? resizeBorderDip : 0;
}
