import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoise1D } from '../prototype/src/noise.js';

test('noise stays within [-1, 1] and is deterministic', () => {
  const n1 = createNoise1D(5), n2 = createNoise1D(5);
  for (let x = -50; x < 50; x += 0.37) {
    const v = n1(x);
    assert.ok(v >= -1 && v <= 1);
    assert.equal(v, n2(x));
  }
});

test('noise is continuous', () => {
  const n = createNoise1D(11);
  for (let x = 0; x < 20; x += 0.1) assert.ok(Math.abs(n(x + 0.001) - n(x)) < 0.01);
});
