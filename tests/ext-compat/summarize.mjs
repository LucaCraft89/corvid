// Summarize an extension compatibility results file.
// results.json: [{ "id": "...", "name": "...", "mv": 2|3, "result": "pass"|"fail"|"skip", "detail": "..." }]
// Usage: node tests/ext-compat/summarize.mjs results.json [--target 0.85]
import { readFileSync } from 'node:fs';

export function summarize(results) {
  const count = { pass: 0, fail: 0, skip: 0 };
  for (const r of results) {
    if (!(r.result in count)) throw new Error(`bad result "${r.result}" for ${r.id}`);
    count[r.result]++;
  }
  const tested = count.pass + count.fail;
  return { total: results.length, tested, ...count, passRate: tested ? count.pass / tested : null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error('usage: summarize.mjs results.json [--target 0.85]'); process.exit(2); }
  const s = summarize(JSON.parse(readFileSync(file, 'utf8')));
  console.log(JSON.stringify(s, null, 2));
  const ti = process.argv.indexOf('--target');
  if (ti > 0) {
    const t = Number(process.argv[ti + 1]);
    if (s.passRate === null || s.passRate < t) { console.error(`pass rate ${s.passRate} below target ${t}`); process.exit(1); }
  }
}
