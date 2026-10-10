// Seeded PRNG (mulberry32) plus helpers. Same seed => same sequence.
export function createRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(entries) {
      let total = 0;
      for (const [, w] of entries) total += Math.max(0, w);
      if (total <= 0) return null;
      let r = next() * total;
      let last = null;
      for (const [value, w] of entries) {
        if (w <= 0) continue;
        last = value;
        r -= w;
        if (r < 0) return value;
      }
      return last;
    },
    fork: () => createRng(Math.floor(next() * 4294967296)),
  };
}
