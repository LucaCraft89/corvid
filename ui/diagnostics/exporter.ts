// Diagnostics exporter: preview -> bundle. The bundle contains exactly the files the preview listed.
// Copyright 2026 The Corvid Authors. BSD-3-Clause. Local only; the caller saves to a user-chosen path.
import { sha256 } from '@noble/hashes/sha2';
import { redactEvent, REDACT_ALL } from './redact.ts';
import type { RedactOptions } from './redact.ts';
import type { DiagEvent } from './types.ts';
import { zipStore } from './zip.ts';

export interface Attachment { name: string; data: Uint8Array; kind: 'minidump' | 'trace' | 'other'; }

export interface ExportRequest {
  events: DiagEvent[];
  redact: boolean | RedactOptions;
  attachments?: Attachment[];
  appVersion: string;
  /** injected for determinism in tests */
  now?: number;
}

export interface PreviewFile { name: string; bytes: number; sha256: string; note?: string }
export interface ExportPreview { files: PreviewFile[]; excluded: { name: string; reason: string }[]; eventCount: number; redacted: boolean }

export interface ExportPlan { preview: ExportPreview; payload: Map<string, Uint8Array> }

const enc = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const SAFE_NAME = /^[A-Za-z0-9._-]{1,100}$/;

export function planExport(req: ExportRequest): ExportPlan {
  const ro: RedactOptions | null = req.redact === true ? REDACT_ALL : req.redact === false ? null : req.redact;
  const events = ro ? req.events.map(e => redactEvent(e, ro)) : req.events;
  const payload = new Map<string, Uint8Array>();
  const excluded: ExportPreview['excluded'] = [];

  payload.set('events.jsonl', enc.encode(events.map(e => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '')));

  for (const a of req.attachments ?? []) {
    if (!SAFE_NAME.test(a.name) || a.name === 'events.jsonl' || a.name === 'manifest.json') {
      excluded.push({ name: a.name, reason: 'unsafe or reserved file name' }); continue;
    }
    // Minidumps/traces embed raw memory, URLs and paths and cannot be reliably redacted: drop when redaction is on.
    if (ro && (a.kind === 'minidump' || a.kind === 'trace')) {
      excluded.push({ name: a.name, reason: 'cannot be redacted; excluded while redaction is on' }); continue;
    }
    payload.set(a.name, a.data);
  }

  const files: PreviewFile[] = [...payload].map(([name, data]) => ({ name, bytes: data.length, sha256: hex(sha256(data)) }));
  const preview: ExportPreview = { files, excluded, eventCount: events.length, redacted: !!ro };

  // manifest is part of the bundle and of the preview (it lists the others).
  const manifest = enc.encode(JSON.stringify({
    format: 'corvid-diagnostics-export/1', appVersion: req.appVersion, createdAt: req.now ?? Date.now(),
    redacted: !!ro, eventCount: events.length, files, excluded,
  }, null, 2));
  payload.set('manifest.json', manifest);
  preview.files.push({ name: 'manifest.json', bytes: manifest.length, sha256: hex(sha256(manifest)) });
  return { preview, payload };
}

export function buildBundle(plan: ExportPlan): Uint8Array {
  // Order = preview order; refuses if payload and preview ever diverge.
  const entries = plan.preview.files.map(f => {
    const data = plan.payload.get(f.name);
    if (!data || data.length !== f.bytes || hex(sha256(data)) !== f.sha256) throw new Error('export: payload diverged from preview: ' + f.name);
    return { name: f.name, data };
  });
  if (entries.length !== plan.payload.size) throw new Error('export: payload has files not in preview');
  return zipStore(entries);
}
