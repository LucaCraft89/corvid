// Error page view-model: plain summary first, then technical detail. Pure; no DOM, no I/O.
// Copyright 2026 The Corvid Authors. BSD-3-Clause.
import type { DiagEvent } from '../../diagnostics/types.ts';
import { t } from './i18n.ts';

export interface DetailRow { label: string; value: string }
export interface ErrorView {
  summary: string; hint: string; recovery: ('reload' | 'close' | 'wait' | 'diagnostics')[];
  detail: DetailRow[]; errorName: string;
}

const fmtDate = (ms: number) => new Date(ms).toISOString();

export function certProblem(errorName: string): string | null {
  if (/DATE_INVALID/.test(errorName)) return t('detail.cert.expired');
  if (/COMMON_NAME_INVALID|NAME_CONSTRAINT/.test(errorName)) return t('detail.cert.hostname');
  if (/AUTHORITY_INVALID/.test(errorName)) return t('detail.cert.untrusted');
  return null;
}

export function viewForEvent(e: DiagEvent): ErrorView {
  switch (e.kind) {
    case 'net_error': {
      const d = e.data; const rows: DetailRow[] = [];
      rows.push({ label: t('detail.errorCode'), value: `${d.errorName} (${d.errorCode})` });
      rows.push({ label: t('detail.phase'), value: d.phase });
      if (d.resolver) {
        rows.push({ label: t('detail.resolver'), value: d.resolver.kind + (d.resolver.server ? ` ${d.resolver.server}` : '') });
        if (d.resolver.addresses?.length) rows.push({ label: t('detail.addresses'), value: d.resolver.addresses.join(', ') });
      }
      const tm = Object.entries(d.timingsMs).map(([k, v]) => `${k}=${v}`).join(' ');
      if (tm) rows.push({ label: t('detail.timings'), value: tm });
      if (d.retries.length) rows.push({ label: t('detail.retries'), value: d.retries.map(r => `#${r.attempt} +${r.atMs}ms ${r.errorName}`).join('; ') });
      if (d.redirectChain?.length) rows.push({ label: t('detail.redirects'), value: d.redirectChain.join(' -> ') });
      return { summary: t('explain.net.' + d.phase), hint: t('hint.net.' + d.phase), recovery: ['reload', 'diagnostics'], detail: rows, errorName: d.errorName };
    }
    case 'tls': {
      const d = e.data; const rows: DetailRow[] = [];
      rows.push({ label: t('detail.errorCode'), value: d.errorName });
      const prob = certProblem(d.errorName);
      if (prob) rows.push({ label: prob, value: d.hostname });
      const only = d.chain.length === 1 ? d.chain[0] : undefined;
      if (only && only.subject === only.issuer) rows.push({ label: t('detail.cert.selfSigned'), value: only.subject });
      d.chain.forEach((c, i) => rows.push({
        label: `${t('detail.chain')} [${i}]`,
        value: `${c.subject} | issuer ${c.issuer} | ${fmtDate(c.notBefore)} .. ${fmtDate(c.notAfter)} | sha256 ${c.sha256}`,
      }));
      return { summary: t('explain.net.tls'), hint: t('hint.net.tls'), recovery: ['reload', 'diagnostics'], detail: rows, errorName: d.errorName };
    }
    case 'hang':
    case 'freeze': {
      const d = e.data; const stackLines = d.stack.map(f => `${f.fn}${f.file ? ` (${f.file}${f.line ? ':' + f.line : ''})` : ''}`);
      const rows: DetailRow[] = [{ label: t('detail.stack'), value: d.stackCaptured && stackLines.length ? stackLines.join('\n') : t('detail.stack.none') }];
      return { summary: t('explain.' + e.kind), hint: t('hint.hang'), recovery: ['wait', 'close', 'reload', 'diagnostics'], detail: rows, errorName: e.kind };
    }
    case 'crash':
      return { summary: t('explain.crash'), hint: t('hint.crash'), recovery: ['reload', 'close', 'diagnostics'],
        detail: [{ label: t('detail.errorCode'), value: e.data.reason }, { label: t('detail.stack'), value: e.data.symbolizedSummary || t('detail.stack.none') }], errorName: 'crash' };
    default:
      throw new Error('no error view for kind ' + e.kind);
  }
}
