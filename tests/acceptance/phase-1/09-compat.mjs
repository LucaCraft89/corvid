#!/usr/bin/env node
// Acceptance 9: top-100 extension run recorded; pass rate >= target. The target is 85% (CR-6 resolved 2026-10-09;
// override with CORVID_COMPAT_TARGET). The extension list/results come from tests/ext-compat/.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { summarize } from '../../ext-compat/summarize.mjs';
import { skip } from './lib/cdp.mjs';

const results = fileURLToPath(new URL('../../ext-compat/results.json', import.meta.url));
if (!existsSync(results)) skip('tests/ext-compat/results.json missing (the sweep has not been run; needs a built browser and the top-100 list)');
const s = summarize(JSON.parse(readFileSync(results, 'utf8')));
const target = Number(process.env.CORVID_COMPAT_TARGET ?? 0.85); // CR-6 resolved: 85%
console.log(JSON.stringify(s));
if (s.total < 100) { console.log(`FAIL compat: only ${s.total} extensions recorded (need 100)`); process.exit(1); }
if (s.passRate === null || s.passRate < target) { console.log(`FAIL compat: pass rate ${s.passRate} < target ${target}`); process.exit(1); }
console.log(`PASS compat: ${(s.passRate * 100).toFixed(1)}% >= ${(target * 100).toFixed(0)}%`);
