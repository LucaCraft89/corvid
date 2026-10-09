// Hub view-model: filters, per-tab grouping, timeline buckets, export flow. Pure/testable.
// Copyright 2026 The Corvid Authors. BSD-3-Clause.
import type { DiagEvent, EventFilter, Kind } from '../../diagnostics/types.ts';
import type { ExportPreview } from '../../diagnostics/exporter.ts';

/** Backend port: Mojo DiagnosticsService in the browser, a fake in tests. */
export interface DiagnosticsBackend {
  query(f: EventFilter): Promise<DiagEvent[]>;
  subscribe(cb: (e: DiagEvent) => void): () => void;
  previewExport(f: EventFilter, redact: boolean): Promise<{ preview: ExportPreview; token: string }>;
  commitExport(token: string): Promise<{ ok: boolean; savedPath?: string }>;
}

export interface TimelineBucket { startTs: number; counts: Partial<Record<Kind, number>>; worst: DiagEvent['severity'] | null }

export function bucketize(events: DiagEvent[], fromTs: number, toTs: number, bucketMs: number): TimelineBucket[] {
  if (bucketMs <= 0 || toTs <= fromTs) return [];
  const n = Math.ceil((toTs - fromTs) / bucketMs);
  if (n > 10_000) throw new Error('too many buckets');
  const order = ['debug', 'info', 'warning', 'error', 'fatal'];
  const out: TimelineBucket[] = Array.from({ length: n }, (_, i) => ({ startTs: fromTs + i * bucketMs, counts: {}, worst: null }));
  for (const e of events) {
    if (e.ts < fromTs || e.ts >= toTs) continue;
    const b = out[Math.floor((e.ts - fromTs) / bucketMs)];
    b.counts[e.kind] = (b.counts[e.kind] ?? 0) + 1;
    if (!b.worst || order.indexOf(e.severity) > order.indexOf(b.worst)) b.worst = e.severity;
  }
  return out;
}

export function groupByTab(events: DiagEvent[]): Map<number | undefined, DiagEvent[]> {
  const m = new Map<number | undefined, DiagEvent[]>();
  for (const e of events) { const a = m.get(e.tabId) ?? []; a.push(e); m.set(e.tabId, a); }
  return m;
}

export class HubModel {
  filter: EventFilter = { limit: 500 };
  events: DiagEvent[] = [];
  redact = true;  // privacy-safe default for export
  exportState: { preview: ExportPreview; token: string } | null = null;
  private off?: () => void;
  onChange: () => void = () => {};
  private backend: DiagnosticsBackend;
  constructor(backend: DiagnosticsBackend) { this.backend = backend; }

  async start() {
    this.events = await this.backend.query(this.filter);
    this.off = this.backend.subscribe(e => { if (this.matches(e)) { this.events.push(e); if (this.filter.limit && this.events.length > this.filter.limit) this.events.shift(); this.onChange(); } });
    this.onChange();
  }
  stop() { this.off?.(); }
  async setFilter(f: Partial<EventFilter>) { this.filter = { ...this.filter, ...f }; this.events = await this.backend.query(this.filter); this.onChange(); }

  matches(e: DiagEvent): boolean {
    const f = this.filter;
    if (f.kinds?.length && !f.kinds.includes(e.kind)) return false;
    if (f.tabId !== undefined && e.tabId !== f.tabId) return false;
    const order = ['debug', 'info', 'warning', 'error', 'fatal'];
    if (f.minSeverity && order.indexOf(e.severity) < order.indexOf(f.minSeverity)) return false;
    if (f.text && !JSON.stringify(e).toLowerCase().includes(f.text.toLowerCase())) return false;
    return true;
  }

  async beginExport() { this.exportState = await this.backend.previewExport(this.filter, this.redact); this.onChange(); return this.exportState.preview; }
  async toggleRedact(v: boolean) { this.redact = v; if (this.exportState) await this.beginExport(); }  // preview always re-derived
  async confirmExport() {
    if (!this.exportState) throw new Error('no preview');
    const r = await this.backend.commitExport(this.exportState.token);
    this.exportState = null; this.onChange(); return r;
  }
  cancelExport() { this.exportState = null; this.onChange(); }
}
