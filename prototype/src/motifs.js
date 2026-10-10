export function createMotifLibrary(list) {
  const byId = new Map();
  const byKey = new Map();
  for (const m of list) {
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
