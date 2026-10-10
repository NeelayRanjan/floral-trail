import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRng } from '../prototype/src/rng.js';
import { createMotifLibrary } from '../prototype/src/motifs.js';

const ring = [[0, 0], [1, 0], [1, 1]];

test('library indexes motifs by set and type', () => {
  const lib = createMotifLibrary([
    { id: 'a', type: 'flower', presets: ['botanical', 'nouveau'], baseSize: 20, silhouette: [ring], ink: [] },
    { id: 'b', type: 'bud', presets: ['nouveau'], baseSize: 20, silhouette: [ring], ink: [] },
  ]);
  assert.ok(lib.has('botanical', 'flower'));
  assert.ok(!lib.has('botanical', 'bud'));
  assert.equal(lib.get('b').type, 'bud');
  assert.equal(lib.pick('nouveau', 'bud', createRng(1)).id, 'b');
  assert.equal(lib.pick('ribbon', 'bud', createRng(1)), null);
});

test('generated motifs.json is well formed', async () => {
  const data = JSON.parse(await readFile(new URL('../prototype/assets/motifs.json', import.meta.url), 'utf8'));
  assert.ok(data.length >= 4);
  const ids = new Set();
  for (const m of data) {
    assert.ok(!ids.has(m.id));
    ids.add(m.id);
    assert.ok(['bloom', 'flower', 'bud', 'leaf', 'frill'].includes(m.type), m.id);
    assert.ok(m.baseSize > 0);
    assert.ok(m.silhouette.length >= 1, m.id);
    for (const r of m.silhouette) for (const [u, v] of r) assert.ok(Math.abs(u) <= 1.0001 && Math.abs(v) <= 1.0001, m.id);
  }
  for (const [set, type] of [['botanical', 'flower'], ['nouveau', 'leaf'], ['nouveau', 'frill']]) {
    assert.ok(data.some((m) => m.type === type && m.presets.includes(set)), `${set}:${type}`);
  }
});
