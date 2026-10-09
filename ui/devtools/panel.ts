// Corvid DevTools panel (diagnostics mirror + freeze capture + perf overlay toggle).
// Copyright 2026 The Corvid Authors. BSD-3-Clause.
//
// UNVERIFIED: DevTools module registration was not inspected (no devtools-frontend checkout here).
// Plan, to confirm per docs/notes/devtools.md on the pinned tree:
//   - Ship as a DevTools *extension page* (chrome.devtools.panels.create) bundled with the browser, so
//     third_party/devtools-frontend needs no edits; OR register through the frontend's
//     `UI.ViewManager.registerViewExtension` in a small overlay module if extension panels cannot reach
//     the Corvid Mojo bridge. The decision is recorded in docs/notes/devtools.md.
//   - Data comes from a host binding `corvidDiagnostics` (Mojo DiagnosticsService, filtered to the
//     inspected tab id). No fetch/XHR/WebSocket anywhere in this file.
import type { DiagEvent } from '../diagnostics/types.ts';
import { PerfTracker } from './perf-overlay.ts';
import { copyAsReport, VERBOSE_DEFAULTS } from './verbose-console.ts';
import type { ConsoleEntry } from './verbose-console.ts';

export interface HostBinding {
  tabId: number;
  query(filter: { tabId: number; limit: number }): Promise<DiagEvent[]>;
  subscribe(cb: (e: DiagEvent) => void): () => void;
  captureFreezeStack(tabId: number): Promise<{ ok: boolean; tracePath: string }>;
  openHub(tabId: number): void;
}

/** Hang reports linked into DevTools: a hang event becomes a console-style entry with its stack. */
export function eventToConsoleEntry(e: DiagEvent): ConsoleEntry | null {
  switch (e.kind) {
    case 'console': return { ts: e.ts, level: e.data.level, source: 'javascript', message: e.data.message, url: e.data.sourceUrl, line: e.data.line, stack: e.data.stack };
    case 'hang': case 'freeze': return { ts: e.ts, level: 'error', source: 'other', message: `${e.kind}: renderer blocked ${'durationMs' in e.data ? e.data.durationMs : e.data.blockedMs} ms`, stack: e.data.stack };
    case 'net_error': return { ts: e.ts, level: 'error', source: 'network', message: `${e.data.errorName} during ${e.data.phase}`, url: e.data.url };
    case 'tls': return { ts: e.ts, level: 'error', source: 'security', message: `${e.data.errorName} for ${e.data.hostname}`, url: e.data.url };
    default: return null;
  }
}

export class DiagnosticsPanel {
  entries: ConsoleEntry[] = []; tracker = new PerfTracker(); settings = VERBOSE_DEFAULTS;
  private host: HostBinding; private off?: () => void;
  constructor(host: HostBinding) { this.host = host; }
  async start() {
    for (const e of await this.host.query({ tabId: this.host.tabId, limit: 1000 })) this.ingest(e);
    this.off = this.host.subscribe(e => { if (e.tabId === this.host.tabId) this.ingest(e); });
  }
  stop() { this.off?.(); }
  private ingest(e: DiagEvent) { const c = eventToConsoleEntry(e); if (c) this.entries.push(c); }
  captureFreeze() { return this.host.captureFreezeStack(this.host.tabId); }
  report(pageUrl: string, ua: string) { return copyAsReport(this.entries, this.settings, { pageUrl, userAgent: ua }); }
  openHub() { this.host.openHub(this.host.tabId); }
}
