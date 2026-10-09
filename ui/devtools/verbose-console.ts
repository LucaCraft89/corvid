// Verbose console model for the Corvid DevTools panel. Pure logic, unit-tested.
// Copyright 2026 The Corvid Authors. BSD-3-Clause. No network I/O.
import type { ConsoleData, StackFrame } from '../diagnostics/types.ts';

export type Level = ConsoleData['level'];
export interface ConsoleEntry { ts: number; level: Level; source: 'console-api' | 'network' | 'security' | 'javascript' | 'other'; message: string; url?: string; line?: number; stack?: StackFrame[] }

/** Verbose mode: all levels on, nothing hidden by default, stack required where available. */
export interface ConsoleSettings { levels: Record<Level, boolean>; timestamps: boolean; includeNetwork: boolean; includeSecurity: boolean }
export const VERBOSE_DEFAULTS: ConsoleSettings = {
  levels: { verbose: true, info: true, warning: true, error: true }, timestamps: true, includeNetwork: true, includeSecurity: true,
};

export function visible(e: ConsoleEntry, s: ConsoleSettings): boolean {
  if (!s.levels[e.level]) return false;
  if (e.source === 'network' && !s.includeNetwork) return false;
  if (e.source === 'security' && !s.includeSecurity) return false;
  return true;
}

export function formatStack(st?: StackFrame[]): string {
  if (!st?.length) return '    (no stack available)';
  return st.map(f => `    at ${f.fn || '<anonymous>'}${f.file ? ` (${f.file}${f.line !== undefined ? ':' + f.line : ''})` : ''}`).join('\n');
}

export function formatEntry(e: ConsoleEntry, s: ConsoleSettings): string {
  const ts = s.timestamps ? `[${new Date(e.ts).toISOString()}] ` : '';
  const loc = e.url ? ` ${e.url}${e.line !== undefined ? ':' + e.line : ''}` : '';
  return `${ts}${e.level.toUpperCase()} <${e.source}>${loc}\n  ${e.message}\n${formatStack(e.stack)}`;
}

/** "Copy as report": plain text, deterministic, includes counts so a reader can tell nothing was filtered silently. */
export function copyAsReport(entries: ConsoleEntry[], s: ConsoleSettings, header: { pageUrl: string; userAgent: string }): string {
  const shown = entries.filter(e => visible(e, s));
  const counts = { verbose: 0, info: 0, warning: 0, error: 0 } as Record<Level, number>;
  for (const e of shown) counts[e.level]++;
  return [
    'Corvid console report',
    `page: ${header.pageUrl}`,
    `user-agent: ${header.userAgent}`,
    `entries: ${shown.length} of ${entries.length} (verbose ${counts.verbose}, info ${counts.info}, warning ${counts.warning}, error ${counts.error})`,
    '',
    ...shown.map(e => formatEntry(e, s)),
  ].join('\n');
}
