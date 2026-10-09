// Size-capped event ring buffer with optional JSONL persistence. Local only.
// Copyright 2026 The Corvid Authors. BSD-3-Clause.
import { DEFAULT_RETENTION, SEVERITY_ORDER } from './types.ts';
import type { DiagEvent, EventFilter, NewEvent, RetentionConfig } from './types.ts';

/** Persistence port. Chromium side implements this over a file in the profile dir (see ring_buffer.cc). */
export interface LineStore { readAll(): string[]; replaceAll(lines: string[]): void; append(line: string): void }

export class RingBuffer {
  private events: { e: DiagEvent; size: number }[] = [];
  private bytes = 0;
  private nextId = 1;
  private cfg: RetentionConfig;
  private store?: LineStore;
  private now: () => number;
  private listeners = new Set<(e: DiagEvent) => void>();
  dropped = 0;

  constructor(cfg: Partial<RetentionConfig> = {}, store?: LineStore, now: () => number = Date.now) {
    this.cfg = { ...DEFAULT_RETENTION, ...cfg }; this.store = store; this.now = now;
    if (store) this.load(store);
  }

  private load(store: LineStore) {
    for (const line of store.readAll()) {
      try {
        const e = JSON.parse(line) as DiagEvent;
        if (typeof e.ts !== 'number' || typeof e.kind !== 'string') throw new Error('shape');
        e.id = this.nextId++;
        this.push(e, false);
      } catch { this.dropped++; } // torn/corrupt line: skip, never throw on startup
    }
    this.evict();
  }

  private push(e: DiagEvent, persist: boolean) {
    const line = JSON.stringify(e);
    const size = line.length;
    this.events.push({ e, size }); this.bytes += size;
    if (persist) this.store?.append(line);
  }

  private evict(): boolean {
    let evicted = false;
    const cutoff = this.now() - this.cfg.maxAgeMs;
    while (this.events.length &&
           (this.bytes > this.cfg.maxBytes || this.events.length > this.cfg.maxEvents || (this.events[0]?.e.ts ?? Infinity) < cutoff)) {
      const dropped = this.events.shift();
      if (!dropped) break;
      this.bytes -= dropped.size; evicted = true;
    }
    return evicted;
  }

  add<K extends DiagEvent['kind']>(ev: NewEvent<K>): DiagEvent {
    const e = { ...ev, id: this.nextId++ } as DiagEvent;
    this.push(e, true);
    if (this.evict() && this.store) this.store.replaceAll(this.events.map(x => JSON.stringify(x.e)));
    for (const l of this.listeners) l(e);
    return e;
  }

  subscribe(fn: (e: DiagEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  query(f: EventFilter = {}): DiagEvent[] {
    const min = f.minSeverity ? SEVERITY_ORDER.indexOf(f.minSeverity) : 0;
    const text = f.text?.toLowerCase();
    const out: DiagEvent[] = [];
    for (let i = this.events.length - 1; i >= 0; i--) {
      const slot = this.events[i];
      if (!slot) continue;
      const e = slot.e;
      if (f.kinds && !f.kinds.includes(e.kind)) continue;
      if (SEVERITY_ORDER.indexOf(e.severity) < min) continue;
      if (f.tabId !== undefined && e.tabId !== f.tabId) continue;
      if (f.sinceTs !== undefined && e.ts < f.sinceTs) continue;
      if (f.untilTs !== undefined && e.ts > f.untilTs) continue;
      if (text && !JSON.stringify(e).toLowerCase().includes(text)) continue;
      out.push(e);
      if (f.limit && out.length >= f.limit) break;
    }
    return out.reverse();
  }

  clear() { this.events = []; this.bytes = 0; this.store?.replaceAll([]); }
  get size(): number { return this.events.length; }
  get byteSize(): number { return this.bytes; }
  setRetention(cfg: Partial<RetentionConfig>) { this.cfg = { ...this.cfg, ...cfg }; if (this.evict()) this.store?.replaceAll(this.events.map(x => JSON.stringify(x.e))); }
}
