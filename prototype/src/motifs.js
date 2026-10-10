// Rounds off harsh corners: resamples a closed ring evenly, then applies a circular Gaussian
// blur to the coordinates. The blur shrinks with the ring so small details (dots) survive.
function smoothRing(ring) {
  let pts = ring;
  const first = pts[0], last = pts[pts.length - 1];
  if (pts.length > 1 && first[0] === last[0] && first[1] === last[1]) pts = pts.slice(0, -1);
  if (pts.length < 3) return ring;
  const m = pts.length;
  const seg = pts.map((p, i) => Math.hypot(pts[(i + 1) % m][0] - p[0], pts[(i + 1) % m][1] - p[1]));
  const perimeter = seg.reduce((a, b) => a + b, 0);
  if (!(perimeter > 0)) return ring;
  const n = Math.min(400, Math.max(16, Math.round(perimeter / 0.02)));
  const spacing = perimeter / n;
  const even = [];
  let i = 0, walked = 0;
  for (let k = 0; k < n; k++) {
    const target = k * spacing;
    while (i < m - 1 && walked + seg[i] < target) walked += seg[i++];
    const u = seg[i] > 0 ? Math.min(1, (target - walked) / seg[i]) : 0;
    const a = pts[i], b = pts[(i + 1) % m];
    even.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  const sigma = Math.min(0.06, perimeter / 40) / spacing; // in samples
  const reach = Math.max(1, Math.ceil(sigma * 3));
  const weights = [];
  for (let k = -reach; k <= reach; k++) weights.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  const total = weights.reduce((a, b) => a + b, 0);
  return even.map((_, k) => {
    let x = 0, y = 0;
    for (let j = -reach; j <= reach; j++) {
      const q = even[(((k + j) % n) + n) % n];
      const w = weights[j + reach] / total;
      x += q[0] * w;
      y += q[1] * w;
    }
    return [x, y];
  });
}

export function createMotifLibrary(list, { smooth = true } = {}) {
  const byId = new Map();
  const byKey = new Map();
  for (const raw of list) {
    const m = smooth
      ? { ...raw, silhouette: raw.silhouette.map(smoothRing), ink: (raw.ink || []).map(smoothRing) }
      : raw;
    byId.set(m.id, m);
    for (const set of m.presets) {
      const k = `${set}:${m.type}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(m);
    }
  }
  return {
    get: (id) => byId.get(id),
    has: (set, type) => byKey.has(`${set}:${type}`),
    pick: (set, type, rng) => {
      const arr = byKey.get(`${set}:${type}`);
      return arr ? rng.pick(arr) : null;
    },
  };
}

// Browser loader; an unavailable file degrades to procedural-only growth.
export async function loadMotifs(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return createMotifLibrary(await res.json());
  } catch (err) {
    console.warn('motifs unavailable, using procedural terminals only', err);
    return createMotifLibrary([]);
  }
}
