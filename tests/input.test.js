import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PathSampler, Smoother, autoDrawPosition, clampDt } from '../prototype/src/input.js';

const round = (q) => q.map((p) => (p.break ? 'break' : [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6]));

test('PathSampler emits points every `spacing` px along the path', () => {
  const s = new PathSampler(3, 1000);
  s.push(0, 0);
  s.push(10, 0);
  s.push(10, 10);
  assert.deepEqual(round(s.take()), [[0, 0], [3, 0], [6, 0], [9, 0], [10, 2], [10, 5], [10, 8]]);
  assert.deepEqual(s.take(), []);
});

test('a jump larger than the threshold inserts a break instead of a streak', () => {
  const s = new PathSampler(3, 50);
  s.push(0, 0);
  s.push(5, 0);
  s.push(300, 0);
  assert.deepEqual(round(s.take()), [[0, 0], [3, 0], 'break', [300, 0]]);
});

test('breakStrand inserts a single break and restarts', () => {
  const s = new PathSampler(3, 1000);
  s.push(0, 0);
  s.breakStrand();
  s.breakStrand();
  s.push(100, 100);
  assert.deepEqual(round(s.take()), [[0, 0], 'break', [100, 100]]);
});

test('Smoother snaps with zero smoothing and lags then converges with smoothing', () => {
  const a = new Smoother();
  a.update({ x: 0, y: 0 }, 1 / 60, 0);
  assert.deepEqual(a.update({ x: 50, y: 0 }, 1 / 60, 0), { x: 50, y: 0 });
  const b = new Smoother();
  b.update({ x: 0, y: 0 }, 1 / 60, 100);
  const first = b.update({ x: 100, y: 0 }, 1 / 60, 100);
  assert.ok(first.x > 0 && first.x < 30);
  let p;
  for (let i = 0; i < 120; i++) p = b.update({ x: 100, y: 0 }, 1 / 60, 100);
  assert.ok(Math.abs(p.x - 100) < 0.01);
});

test('Smoother tracks speed in px/s', () => {
  const s = new Smoother();
  for (let i = 0; i <= 60; i++) s.update({ x: i * 10, y: 0 }, 1 / 60, 0);
  assert.ok(Math.abs(s.speed - 600) < 5, `speed=${s.speed}`);
});

test('autoDrawPosition is deterministic and stays on screen', () => {
  for (let t = 0; t < 120; t += 0.25) {
    const a = autoDrawPosition(t, 1440, 900, 3);
    assert.deepEqual(a, autoDrawPosition(t, 1440, 900, 3));
    assert.ok(a.x >= 0 && a.x <= 1440 && a.y >= 0 && a.y <= 900);
  }
});

test('clampDt bounds frame gaps', () => {
  assert.equal(clampDt(5), 0.05);
  assert.equal(clampDt(-1), 0);
  assert.equal(clampDt(0.016), 0.016);
});
