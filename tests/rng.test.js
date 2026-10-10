import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../prototype/src/rng.js';

test('same seed gives the same sequence', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next());
});

test('different seeds diverge', () => {
  const a = createRng(1), b = createRng(2);
  let same = 0;
  for (let i = 0; i < 10; i++) if (a.next() === b.next()) same++;
  assert.ok(same < 2);
});

test('next is in [0, 1) and int is inclusive', () => {
  const r = createRng(7);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
    seen.add(r.int(1, 3));
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('weighted never returns zero-weight entries and returns null when all weights are zero', () => {
  const r = createRng(3);
  for (let i = 0; i < 500; i++) assert.notEqual(r.weighted([['a', 1], ['b', 0], ['c', 2]]), 'b');
  assert.equal(r.weighted([['a', 0], ['b', -1]]), null);
});

test('weighted roughly follows weights', () => {
  const r = createRng(9);
  let a = 0;
  for (let i = 0; i < 4000; i++) if (r.weighted([['a', 3], ['b', 1]]) === 'a') a++;
  assert.ok(a > 2800 && a < 3200, `a=${a}`);
});
