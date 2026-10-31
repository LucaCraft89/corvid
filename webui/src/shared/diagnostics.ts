// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Diagnostics log model: what the browser keeps in its in-memory ring buffer
// (hangs, crashes, network and secure-connection errors), turned into text.
// No DOM here so it can be tested directly.

import { t } from '../strings/i18n.js';
import type { StringKey } from '../strings/en.js';

export const DIAG_KINDS = ['crash', 'hang', 'network', 'tls'] as const;
export type DiagKind = (typeof DIAG_KINDS)[number];

export interface DiagEntry {
  /** ISO time. */
  time: string;
  kind: DiagKind;
  /** Net error name, termination status or exit code. */
  code: string;
  /** Renderer, GPU, Network service, ... (crashes and hangs). */
  process?: string;
  /** Site host; empty for private windows. */
  host?: string;
}

/** Keeps only well-formed entries, newest first. Never throws. */
export function sanitizeEntries(raw: unknown): DiagEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is DiagEntry =>
      !!e && typeof e === 'object' && typeof e.time === 'string' && typeof e.code === 'string' &&
      (DIAG_KINDS as readonly string[]).includes(e.kind))
    .map((e) => ({
      time: e.time, kind: e.kind, code: e.code,
      ...(typeof e.process === 'string' && e.process ? { process: e.process } : {}),
      ...(typeof e.host === 'string' && e.host ? { host: e.host } : {}),
    }))
    .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
}

/** One plain sentence for an entry. */
export function entrySummary(e: DiagEntry): string {
  if (e.kind === 'crash') {
    const process = e.process ?? '?';
    return e.host ? t('diag.summary.crashSite', { process, host: e.host }) : t('diag.summary.crash', { process });
  }
  // No host: a private window or not a web address (the browser leaves it out).
  return e.host ? t(`diag.summary.${e.kind}`, { host: e.host }) : t(`diag.summary.${e.kind}NoHost`);
}

export function kindLabel(kind: DiagKind): string {
  return t(`diag.kind.${kind}` as StringKey);
}

/** Plain-text version of the log for "Copy". */
export function diagnosticsText(entries: DiagEntry[]): string {
  if (!entries.length) return t('diag.empty');
  return entries
    .map((e) => [e.time, kindLabel(e.kind), e.code, e.process ?? '', e.host ?? ''].filter(Boolean).join('  '))
    .join('\n');
}
