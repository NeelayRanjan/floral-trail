import { createRng } from './rng.js';

const SIZE = 1024;

// Smooth 1D value noise in [-1, 1]; offset x by a per-element seed for independent streams.
export function createNoise1D(seed) {
  const rng = createRng(seed);
  const table = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) table[i] = rng.next() * 2 - 1;
  return function noise(x) {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[i & (SIZE - 1)];
    const b = table[(i + 1) & (SIZE - 1)];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
}
