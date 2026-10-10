import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grower } from '../prototype/src/grower.js';
import { Scene, DensityGrid } from '../prototype/src/scene.js';
import { createRng } from '../prototype/src/rng.js';
import { presetValues } from '../prototype/src/presets.js';
import { createMotifLibrary } from '../prototype/src/motifs.js';

function setup(overrides = {}, seed = 1, motifs = createMotifLibrary([])) {
  const params = { ...presetValues('ribbon'), subTendrilChance: 0, ...overrides };
  const scene = new Scene();
  const grid = new DensityGrid(48);
  const grower = new Grower({ scene, grid, params, rng: createRng(seed), motifs });
  return { params, scene, grid, grower };
}
const line = (x0, x1, y = 0, step = 3) => {
  const pts = [];
  for (let x = x0; x <= x1; x += step) pts.push({ x, y });
  return pts;
};
const all = (scene) => scene.cohorts.flatMap((c) => c.elements);
const spine = (scene) => all(scene).filter((e) => e.role === 'spine');
const tendrils = (scene) => all(scene).filter((e) => e.role === 'tendril');
const FAST = { growSpeed: 1e6, meanderAmp: 0 };

test('spine growth is capped by growSpeed * dt', () => {
  const { scene, grower } = setup({ growSpeed: 300, meanderAmp: 0, tendrilChance: 0 });
  grower.feed(line(0, 600));
  grower.update(0.1, 0, 0);
  const len = spine(scene)[0].cum.at(-1);
  assert.ok(Math.abs(len - 30) < 0.5, `len=${len}`);
});

test('a long stroke grows a full spine and spawns tendrils', () => {
  const { scene, grower } = setup({ ...FAST, tendrilChance: 1, tendrilSpacing: 100, strandMin: 5000, strandMax: 5000 });
  grower.feed(line(0, 900));
  grower.update(0.016, 0, 1000);
  const total = spine(scene).reduce((a, c) => a + c.cum.at(-1), 0);
  assert.ok(Math.abs(total - 900) < 1, `total=${total}`);
  assert.ok(tendrils(scene).length >= 6);
});

test('a break ends the strand with a terminal tendril and starts a new strand', () => {
  const { scene, grower } = setup({ ...FAST, tendrilChance: 0, strandMin: 5000, strandMax: 5000 });
  grower.feed([...line(0, 300), { break: true }, ...line(0, 300, 200)]);
  grower.update(0.016, 0, 1000);
  assert.equal(spine(scene).filter((c) => c.sOffset === 0).length, 2);
  assert.equal(tendrils(scene).length, 1);
});

test('strands longer than strandMax continue as a new overlapping strand', () => {
  const { scene, grower } = setup({ ...FAST, tendrilChance: 0, strandMin: 300, strandMax: 300 });
  grower.feed(line(0, 1000));
  grower.update(0.016, 0, 1000);
  assert.ok(spine(scene).filter((c) => c.sOffset === 0).length >= 3);
});

test('when the cohort window rolls over the spine continues in a new chunk sharing the seam point', () => {
  const { scene, grower } = setup({ ...FAST, tendrilChance: 0, cohortWindow: 0.5 });
  grower.feed(line(0, 150));
  grower.update(0.016, 0, 1000);
  grower.feed(line(153, 300));
  grower.update(0.016, 1.0, 1000);
  const [a, b] = spine(scene);
  assert.equal(spine(scene).length, 2);
  assert.deepEqual(b.points[0], a.points.at(-1));
  assert.equal(a.taperEnd, false);
  assert.equal(b.taperEnd, true);
  assert.ok(Math.abs(b.sOffset - a.cum.at(-1)) < 1e-9);
  assert.notEqual(a.cohort, b.cohort);
  assert.equal(a.head, b.head);
  assert.deepEqual(b.prev, a.points.at(-2));
  assert.deepEqual(a.next, b.points[1]);
  assert.ok(Math.abs(b.head.s - (b.sOffset + b.cum.at(-1))) < 1e-9);
});

test('density limit caps spawns in a crowded area', () => {
  const { scene, grower } = setup({ ...FAST, tendrilChance: 1, tendrilSpacing: 20, densityLimit: 1, strandMin: 4000, strandMax: 4000 });
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push(...(i % 2 ? line(0, 40).reverse() : line(0, 40)));
  grower.feed(pts);
  grower.update(0.016, 0, 1000);
  assert.ok(tendrils(scene).length <= 2, `tendrils=${tendrils(scene).length}`);
});

test('maxElements stops new spawns', () => {
  const { scene, grower } = setup({ ...FAST, tendrilChance: 1, tendrilSpacing: 20, maxElements: 5, densityLimit: 40, strandMin: 4000, strandMax: 4000 });
  grower.feed(line(0, 3000));
  grower.update(0.016, 0, 1000);
  assert.ok(scene.count <= 5 + 4, `count=${scene.count}`); // a spawn may add a few elements at once
});

test('extreme slider values do not hang or throw', () => {
  const { grower } = setup({
    growSpeed: 1e6, tendrilSpacing: 0, strandMin: 4000, strandMax: 150, lengthMin: 900, lengthMax: 20,
    departMin: 90, departMax: 0, wCurl: 0, wBall: 0, wHook: 0, wBud: 0, wLeaf: 0, wFlower: 0, cohortWindow: 0.1,
    tendrilChance: 1, curlRadius: 2, curlRamp: 8,
  });
  grower.feed(line(0, 2000));
  assert.doesNotThrow(() => grower.update(0.016, 0, 1000));
});

test('same seed and input produce the same growth', () => {
  const run = () => {
    const { scene, grower } = setup({ growSpeed: 1e6 }, 42);
    grower.feed(line(0, 900));
    grower.update(0.016, 0, 1000);
    return JSON.stringify(all(scene).map(({ cohort, ...e }) => e));
  };
  assert.equal(run(), run());
});

const bloomLib = createMotifLibrary([
  { id: 'b1', type: 'bloom', presets: ['ribbon'], baseSize: 60, silhouette: [[[0, 0], [1, 0], [1, 1]]], ink: [] },
]);

test('lingering at low cursor speed spawns a bloom cluster', () => {
  const { scene, grower } = setup({ growSpeed: 1e6, bloomRate: 5, slowSpeed: 200, clusterTendrils: 2 }, 1, bloomLib);
  grower.feed(line(0, 60));
  for (let i = 0; i < 120; i++) grower.update(1 / 60, i / 60, 10);
  const blooms = all(scene).filter((e) => e.kind === 'motif' && e.id === 'b1');
  assert.ok(blooms.length >= 1 && blooms.length <= 3, `blooms=${blooms.length}`);
});

test('no blooms while the cursor moves fast', () => {
  const { scene, grower } = setup({ growSpeed: 1e6, bloomRate: 5, slowSpeed: 200 }, 1, bloomLib);
  grower.feed(line(0, 60));
  for (let i = 0; i < 120; i++) grower.update(1 / 60, i / 60, 1000);
  assert.equal(all(scene).filter((e) => e.kind === 'motif').length, 0);
});
