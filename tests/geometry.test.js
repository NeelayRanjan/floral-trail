import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dist, ordered, cumulativeLengths, resample, normals, sampleAt, truncate,
  curvePath, ribbonSides, ribbonOutline,
} from '../prototype/src/geometry.js';

const round = (pts) => pts.map((p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6]);

test('ordered sorts a pair', () => {
  assert.deepEqual(ordered(5, 2), [2, 5]);
  assert.deepEqual(ordered(1, 3), [1, 3]);
});

test('cumulativeLengths sums segment lengths', () => {
  assert.deepEqual(cumulativeLengths([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]), [0, 5, 11]);
});

test('resample walks around corners by arc length and keeps endpoints', () => {
  const pts = resample([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 3);
  assert.deepEqual(round(pts), [[0, 0], [3, 0], [6, 0], [9, 0], [10, 2], [10, 5], [10, 8], [10, 10]]);
});

test('normals point to +90 degrees of travel (screen y-down)', () => {
  for (const n of normals([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }])) {
    assert.ok(Math.abs(n.x) < 1e-12);
    assert.equal(n.y, 1);
  }
});

test('sampleAt interpolates position and heading', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const a = sampleAt(pts, cumulativeLengths(pts), 15);
  assert.deepEqual(a.point, { x: 10, y: 5 });
  assert.ok(Math.abs(a.heading - Math.PI / 2) < 1e-12);
});

test('truncate cuts a polyline at an arc length, interpolating the end', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
  const cum = cumulativeLengths(pts);
  const t = truncate(pts, cum, 15);
  assert.deepEqual(t.points, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 15, y: 0 }]);
  assert.deepEqual(t.cum, [0, 10, 15]);
  assert.equal(truncate(pts, cum, 99).points.length, 3);
  assert.equal(truncate(pts, cum, 10).points.length, 2);
});

test('curvePath with zero curvature is a straight line of the requested length', () => {
  const { points, endHeading } = curvePath({ x: 0, y: 0, heading: 0, length: 30, curvature: () => 0 });
  const end = points.at(-1);
  assert.ok(Math.abs(end.x - 30) < 1e-9 && Math.abs(end.y) < 1e-9);
  assert.equal(endHeading, 0);
});

test('constant curvature turns by k * length; positive curvature turns toward +normal', () => {
  const k = 1 / 20, L = 2 * Math.PI * 20;
  const { points, endHeading } = curvePath({ x: 0, y: 0, heading: 0, length: L, curvature: () => k, step: 0.5 });
  assert.ok(Math.abs(endHeading - 2 * Math.PI) < 1e-9);
  assert.ok(Math.hypot(points.at(-1).x, points.at(-1).y) < 0.5);
  assert.ok(points[10].y > 0);
});

test('droop pulls the heading toward straight down', () => {
  const { endHeading } = curvePath({ x: 0, y: 0, heading: 0, length: 300, curvature: () => 0, droop: 2 });
  assert.ok(endHeading > 0.5 && endHeading <= Math.PI / 2 + 1e-9);
});

const straight = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
const sides = () => ribbonSides(straight, [2, 2, 2], [2, 2, 2]);

test('ribbonSides offsets by half widths along the normal', () => {
  const { left, right } = sides();
  assert.deepEqual(left.map((p) => p.y), [2, 2, 2]);
  assert.deepEqual(right.map((p) => p.y), [-2, -2, -2]);
});

test('closed caps give one closed run matching the polygon', () => {
  const { left, right } = sides();
  const o = ribbonOutline(straight, left, right, 'flat', 'flat');
  assert.equal(o.polygon.length, 6);
  assert.equal(o.runs.length, 1);
  assert.equal(o.runs[0].closed, true);
});

test('open ends are left out of the stroke runs', () => {
  const { left, right } = sides();
  const both = ribbonOutline(straight, left, right, 'open', 'open');
  assert.equal(both.runs.length, 2);
  assert.ok(both.runs.every((r) => !r.closed));
  const openStart = ribbonOutline(straight, left, right, 'open', 'flat');
  assert.equal(openStart.runs.length, 1);
  assert.deepEqual(openStart.runs[0].points[0], left[0]);
  assert.deepEqual(openStart.runs[0].points.at(-1), right[0]);
  const openEnd = ribbonOutline(straight, left, right, 'flat', 'open');
  assert.deepEqual(openEnd.runs[0].points[0], right.at(-1));
  assert.deepEqual(openEnd.runs[0].points.at(-1), left.at(-1));
});

test('round end cap bulges forward by the half width', () => {
  const { left, right } = sides();
  const o = ribbonOutline(straight, left, right, 'flat', 'round');
  const maxX = Math.max(...o.polygon.map((p) => p.x));
  assert.ok(Math.abs(maxX - 22) < 0.05, `maxX=${maxX}`);
});

test('dist is euclidean', () => {
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('normals can use neighbours beyond the ends so adjacent chunks agree at the seam', () => {
  const a = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const b = [{ x: 10, y: 0 }, { x: 10, y: 10 }];
  const na = normals(a, null, b[1]).at(-1);
  const nb = normals(b, a[0], null)[0];
  assert.ok(Math.abs(na.x - nb.x) < 1e-12 && Math.abs(na.y - nb.y) < 1e-12);
  assert.ok(Math.abs(na.x - -Math.SQRT1_2) < 1e-12 && Math.abs(na.y - Math.SQRT1_2) < 1e-12);
});
