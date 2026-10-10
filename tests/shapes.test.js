import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetValues } from '../prototype/src/presets.js';
import { curvePath, cumulativeLengths } from '../prototype/src/geometry.js';
import {
  spineHalfWidth, tendrilHalfWidth, ribbonShape, blobShape, motifShape, shapeBounds, easeOutBack,
} from '../prototype/src/shapes.js';

const P = {
  ...presetValues('ribbon'),
  wobbleLow: 0, roughness: 0, spineWidth: 10, tendrilWidth: 1, tendrilEndWidth: 0.5, tailTaper: 0, tipTaper: 0,
  widthNoise: 0, ballSize: 1.1, motifScale: 1,
};
const flat = () => 0;
const xs = (shape) => shape.fill.rings.flat().map((p) => p.x);

test('spine half width follows width param with tail and tip tapers', () => {
  const el = { seed: 1, taperEnd: true };
  assert.equal(spineHalfWidth(P, flat, el, 50, 50), 5);
  const tapered = { ...P, tailTaper: 100, tipTaper: 50 };
  assert.equal(spineHalfWidth(tapered, flat, el, 0, 200), 0);
  assert.ok(Math.abs(spineHalfWidth(tapered, flat, el, 100, 200) - 5) < 1e-12);
  assert.equal(spineHalfWidth(tapered, flat, el, 150, 0), 0);
  assert.ok(Math.abs(spineHalfWidth(tapered, flat, { ...el, taperEnd: false }, 150, 0) - 5) < 1e-12);
});

test('tendrilHalfWidth interpolates to the end ratio', () => {
  assert.equal(tendrilHalfWidth(P, 1, 0), 5);
  assert.equal(tendrilHalfWidth(P, 1, 1), 2.5);
  assert.equal(tendrilHalfWidth(P, 0.5, 0), 2.5);
});

const chunk = (over) => ({
  kind: 'ribbon', role: 'spine', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], cum: [0, 10, 20],
  sOffset: 50, seed: 1, taperEnd: false, born: 0, growDuration: 0, ...over,
});

test('a middle spine chunk is open at both ends and offset by the half width', () => {
  const s = ribbonShape(chunk(), P, flat, 0);
  assert.equal(s.runs.length, 2);
  const ys = s.fill.rings[0].map((p) => p.y);
  assert.equal(Math.max(...ys), 5);
  assert.equal(Math.min(...ys), -5);
});

test('a strand-start head chunk is a single closed outline', () => {
  const s = ribbonShape(chunk({ sOffset: 0, taperEnd: true }), P, flat, 0);
  assert.equal(s.runs.length, 1);
  assert.equal(s.runs[0].closed, true);
});

const tendril = () => {
  const { points } = curvePath({ x: 0, y: 0, heading: 0, length: 100, curvature: () => 0 });
  return { kind: 'ribbon', role: 'tendril', points, cum: cumulativeLengths(points), length: 100, scale: 1,
    seed: 2, born: 0, growDuration: 1, capStart: 'flat', capEnd: 'round' };
};

test('a growing tendril only shows the grown prefix', () => {
  const el = tendril();
  assert.equal(ribbonShape(el, P, flat, 0), null);
  const mid = Math.max(...xs(ribbonShape(el, P, flat, 0.5)));
  assert.ok(mid > 85 && mid < 94, `mid=${mid}`);
  const done = Math.max(...xs(ribbonShape(el, P, flat, 2)));
  assert.ok(Math.abs(done - 102.5) < 0.05, `done=${done}`);
});

test('blobShape radius grows from zero to rel * ballSize * tendril half width', () => {
  const blob = { kind: 'blob', x: 0, y: 0, rel: 1, born: 0, growDuration: 0.35 };
  assert.equal(blobShape(blob, P, flat, -1), null);
  const r = Math.max(...xs(blobShape(blob, P, flat, 1)));
  assert.ok(Math.abs(r - 5.5) < 1e-9, `r=${r}`);
});

test('motifShape places normalised rings by anchor, angle, size and flip', () => {
  const motif = { silhouette: [[[0, 0], [1, 0], [1, 0.5]]], ink: [] };
  const el = { kind: 'motif', x: 100, y: 50, angle: Math.PI / 2, size: 10, flip: 1, born: 0, growDuration: 0.001 };
  const s = motifShape(el, motif, P, 1);
  const ring = s.fill.rings[0];
  assert.ok(Math.abs(ring[1].x - 100) < 1e-9 && Math.abs(ring[1].y - 60) < 1e-9);
  assert.ok(Math.abs(ring[2].x - 95) < 1e-9 && Math.abs(ring[2].y - 60) < 1e-9);
  const flipped = motifShape({ ...el, flip: -1 }, motif, P, 1).fill.rings[0];
  assert.ok(Math.abs(flipped[2].x - 105) < 1e-9);
  assert.equal(s.ink, null);
  assert.equal(motifShape(el, null, P, 1), null);
});

test('easeOutBack ends at exactly 1', () => {
  assert.equal(easeOutBack(1), 1);
});

test('shapeBounds covers every ring', () => {
  const b = shapeBounds([ribbonShape(chunk(), P, flat, 0)]);
  assert.deepEqual(b, { minX: 0, minY: -5, maxX: 20, maxY: 5 });
});
