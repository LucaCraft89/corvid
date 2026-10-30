// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// WCAG 2.x contrast. No dependencies, so the pages and the tests share it.

export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_NON_TEXT = 3;

/** Parses #rgb or #rrggbb (case-insensitive). Returns null if invalid. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h[0]! + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function isHexColor(hex: string): boolean {
  return parseHex(hex) !== null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`not a colour: ${hex}`);
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** Contrast ratio between two colours, 1 to 21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function meetsAA(fg: string, bg: string, kind: 'text' | 'large-text' | 'non-text' = 'text'): boolean {
  const min = kind === 'text' ? AA_TEXT : AA_LARGE_TEXT;
  // Round to two decimals the way contrast checkers report it, so 4.499 fails.
  return Math.floor(contrastRatio(fg, bg) * 100) / 100 >= min;
}
