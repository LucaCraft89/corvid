// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Talks to the browser when a page runs inside Corvid. The browser serves
// corvid-init.js (window.corvidInit: prefs, desktop accent colour) before the
// page script runs, takes messages through chrome.send(), and answers by
// calling window.corvidBrowser.dispatch(event, value). On the dev server none
// of this exists and the pages fall back to local storage and defaults.

export interface BrowserInit {
  prefs?: unknown;
  /** Desktop accent colour as #rrggbb, or null when the desktop has none. */
  accent?: string | null;
  /** Private windows: changes stay in the page and are not saved. */
  readOnly?: boolean;
}

export type BrowserEvent = 'prefs' | 'accent' | 'diagnostics';
type Listener = (value: unknown) => void;

declare global {
  interface Window {
    corvidInit?: BrowserInit;
    corvidBrowser?: { dispatch(event: BrowserEvent, value: unknown): void };
    chrome?: { send?: (message: string, args?: unknown[]) => void };
  }
}

const listeners = new Map<BrowserEvent, Set<Listener>>();

export function inBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.corvidInit && typeof window.chrome?.send === 'function';
}

export function browserInit(): BrowserInit {
  return (typeof window !== 'undefined' && window.corvidInit) || {};
}

export function send(message: string, ...args: unknown[]): void {
  if (inBrowser()) window.chrome!.send!(message, args);
}

export function onBrowser(event: BrowserEvent, fn: Listener): () => void {
  if (typeof window !== 'undefined' && !window.corvidBrowser) {
    window.corvidBrowser = {
      dispatch(e, value) {
        listeners.get(e)?.forEach((l) => l(value));
      },
    };
  }
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}
