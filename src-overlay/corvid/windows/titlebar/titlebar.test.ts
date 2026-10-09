import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDragRegions, titlebarCssVars, type CaptionMetrics } from './titlebar.ts';

const m: CaptionMetrics = { insetRight: 138, insetLeft: 0, height: 32, maximized: false, active: true, forcedColors: false };
const bar = { x: 0, y: 0, width: 1000, height: 32 };
const area = (rs: { width: number; height: number }[]) => rs.reduce((s, r) => s + r.width * r.height, 0);

test('no interactive elements: whole bar minus caption zone is draggable', () => {
  const r = computeDragRegions(bar, m, []);
  assert.deepEqual(r, [{ x: 0, y: 0, width: 862, height: 32 }]);
});

test('tabs carve holes; area is conserved', () => {
  const tabs = [{ x: 10, y: 4, width: 200, height: 28 }, { x: 300, y: 0, width: 40, height: 32 }];
  const r = computeDragRegions(bar, m, tabs);
  assert.equal(area(r), 862 * 32 - 200 * 28 - 40 * 32);
  // nothing overlaps an interactive rect
  for (const d of r) for (const t of tabs) {
    const overlap = d.x < t.x + t.width && t.x < d.x + d.width && d.y < t.y + t.height && t.y < d.y + d.height;
    assert.equal(overlap, false);
  }
});

test('interactive rect overlapping caption zone is clipped, tiny window yields nothing', () => {
  const r = computeDragRegions(bar, m, [{ x: 800, y: 0, width: 300, height: 32 }]);
  assert.equal(area(r), 800 * 32);
  assert.deepEqual(computeDragRegions({ ...bar, width: 100 }, m, []), []);
});

test('css vars', () => {
  assert.equal(titlebarCssVars({ ...m, active: false })['--cv-titlebar-opacity'], '0.7');
});
