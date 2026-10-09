import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from './summarize.mjs';

test('summarize counts and computes pass rate over tested (skips excluded)', () => {
  const s = summarize([
    { id: 'a', result: 'pass' }, { id: 'b', result: 'pass' }, { id: 'c', result: 'fail' }, { id: 'd', result: 'skip' },
  ]);
  assert.deepEqual(s, { total: 4, tested: 3, pass: 2, fail: 1, skip: 1, passRate: 2 / 3 });
  assert.equal(summarize([]).passRate, null);
  assert.throws(() => summarize([{ id: 'x', result: 'maybe' }]));
});
