// Perf overlay core: long-task tracking, blocking time, fps. Pure aggregator + thin browser binding.
// Copyright 2026 The Corvid Authors. BSD-3-Clause.

export interface LongTask { start: number; duration: number }
export interface OverlaySnapshot { longTasks: number; totalBlockingMs: number; worstMs: number; fps: number; heapMb?: number; recent: LongTask[] }

export const LONG_TASK_MS = 50; // same threshold as the Long Tasks API

export class PerfTracker {
  private tasks: LongTask[] = [];
  private frames: number[] = [];
  private windowMs: number;
  constructor(windowMs = 10_000) { this.windowMs = windowMs; }

  addTask(start: number, duration: number) { if (duration >= LONG_TASK_MS) this.tasks.push({ start, duration }); }
  addFrame(ts: number) { this.frames.push(ts); }

  snapshot(now: number, heapBytes?: number): OverlaySnapshot {
    const from = now - this.windowMs;
    this.tasks = this.tasks.filter(t => t.start + t.duration >= from);
    this.frames = this.frames.filter(t => t >= from);
    const span = Math.min(this.windowMs, now - (this.frames[0] ?? now));
    return {
      longTasks: this.tasks.length,
      // Blocking time per Total Blocking Time definition: time beyond 50ms per task.
      totalBlockingMs: Math.round(this.tasks.reduce((n, t) => n + (t.duration - LONG_TASK_MS), 0)),
      worstMs: Math.round(this.tasks.reduce((m, t) => Math.max(m, t.duration), 0)),
      fps: span > 0 ? Math.round((this.frames.length - 1) / (span / 1000)) : 0,
      heapMb: heapBytes === undefined ? undefined : Math.round(heapBytes / 1048576),
      recent: this.tasks.slice(-5),
    };
  }
}

/** Browser binding (UNVERIFIED in a real page; runs only inside the inspected page's isolated overlay). */
export function attachToPage(tracker: PerfTracker, g: { PerformanceObserver?: any; requestAnimationFrame?: (cb: (t: number) => void) => number }): () => void {
  let stop = false;
  let obs: any;
  if (g.PerformanceObserver) {
    obs = new g.PerformanceObserver((list: any) => { for (const e of list.getEntries()) tracker.addTask(e.startTime, e.duration); });
    obs.observe({ type: 'longtask', buffered: true });
  }
  const tick = (t: number) => { if (stop) return; tracker.addFrame(t); g.requestAnimationFrame?.(tick); };
  g.requestAnimationFrame?.(tick);
  return () => { stop = true; obs?.disconnect(); };
}
