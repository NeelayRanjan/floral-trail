import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, DensityGrid, cohortAlpha, ageStep } from '../prototype/src/scene.js';

const el = (born, growDuration = 1) => ({ born, growDuration });

test('elements added within one window share a cohort; a later add opens a new one', () => {
  const s = new Scene();
  const a = el(0), b = el(0.5), c = el(1);
  s.add(a, 'front', 0, 0.75);
  s.add(b, 'front', 0.5, 0.75);
  s.add(c, 'front', 1.0, 0.75);
  assert.equal(a.cohort, b.cohort);
  assert.notEqual(b.cohort, c.cohort);
  assert.equal(s.cohorts.length, 2);
  assert.equal(s.count, 3);
});

test('front and back tracks get separate cohorts', () => {
  const s = new Scene();
  const a = el(0), b = el(0);
  s.add(a, 'front', 0, 1);
  s.add(b, 'back', 0, 1);
  assert.notEqual(a.cohort, b.cohort);
  assert.equal(b.cohort.track, 'back');
});

test('isGrowing is true until the last element finishes', () => {
  const s = new Scene();
  const c = s.add(el(0, 1), 'front', 0, 1);
  s.add(el(0.2, 2), 'front', 0.2, 1);
  assert.equal(s.isGrowing(c, 1.5), true);
  assert.equal(s.isGrowing(c, 2.3), false);
});

test('touch bumps the version', () => {
  const s = new Scene();
  const c = s.add(el(0), 'front', 0, 1);
  const v = c.version;
  s.touch(c);
  assert.equal(c.version, v + 1);
});

test('cull removes cohorts older than lifetime, frees buffers and resets current', () => {
  const s = new Scene();
  const a = el(0), c = el(5);
  s.add(a, 'front', 0, 0.75);
  a.cohort.renderState = { canvas: 'x' };
  s.add(c, 'front', 5, 0.75);
  const removed = s.cull(9.5, 9);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].renderState, null);
  assert.equal(s.count, 1);
  assert.equal(s.cohorts.length, 1);
  s.cull(100, 9);
  assert.equal(s.current.front, null);
  assert.equal(s.count, 0);
});

test('clear empties everything', () => {
  const s = new Scene();
  s.add(el(0), 'front', 0, 1);
  s.clear();
  assert.equal(s.cohorts.length, 0);
  assert.equal(s.count, 0);
});

test('cohortAlpha holds, then eases to zero', () => {
  assert.equal(cohortAlpha(0, 10, 0.5), 1);
  assert.equal(cohortAlpha(5, 10, 0.5), 1);
  assert.ok(Math.abs(cohortAlpha(7.5, 10, 0.5) - 0.5) < 1e-12);
  assert.equal(cohortAlpha(10, 10, 0.5), 0);
  assert.equal(cohortAlpha(12, 10, 0.5), 0);
});

test('ageStep quantises age into steps', () => {
  assert.equal(ageStep(0, 8, 8), 0);
  assert.equal(ageStep(4, 8, 8), 4);
  assert.equal(ageStep(100, 8, 8), 8);
});

test('DensityGrid counts per cell and removes by key', () => {
  const g = new DensityGrid(48);
  const k1 = g.add(10, 10);
  g.add(20, 30);
  g.add(100, 10);
  assert.equal(g.count(5, 5), 2);
  assert.equal(g.count(100, 10), 1);
  g.remove(k1);
  assert.equal(g.count(5, 5), 1);
  g.clear();
  assert.equal(g.count(20, 30), 0);
});
