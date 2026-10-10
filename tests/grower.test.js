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
  grower.feed(line(0, 90)); // short backlog: no catch-up boost
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
  const perCell = new Map();
  for (const t of tendrils(scene)) perCell.set(t.cellKey, (perCell.get(t.cellKey) || 0) + 1);
  assert.ok(perCell.size >= 1);
  for (const [cell, n] of perCell) assert.equal(n, 1, `cell ${cell} has ${n} spawns`);
  assert.ok(tendrils(scene).length <= 8, `tendrils=${tendrils(scene).length}`); // ~19 spawn attempts were made
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

test('a cursor faster than growSpeed does not build an ever-growing backlog', () => {
  const { grower } = setup({ growSpeed: 900, meanderAmp: 0, tendrilChance: 0, strandMin: 4000, strandMax: 4000 });
  let x = 0, now = 0;
  for (let f = 0; f < 300; f++) { // 5 s of input at ~2340 px/s
    const pts = [];
    for (let i = 0; i < 13; i++) pts.push({ x: (x += 3), y: 0 });
    grower.feed(pts);
    now += 1 / 60;
    grower.update(1 / 60, now, 2400);
  }
  for (let f = 0; f < 75; f++) grower.update(1 / 60, (now += 1 / 60), 0); // 1.25 s after the cursor stops
  assert.equal(grower.pending.length, 0);
});

test('a strand that sits idle ends with a terminal, and drawing again starts a fresh strand', () => {
  const { scene, grower } = setup({ ...FAST, tendrilChance: 0, strandMin: 4000, strandMax: 4000 });
  grower.feed(line(0, 300));
  grower.update(0.016, 0, 1000);
  assert.equal(tendrils(scene).length, 0);
  grower.update(0.016, 2.0, 0); // nothing fed for 2 s
  assert.equal(tendrils(scene).length, 1);
  grower.feed(line(303, 600));
  grower.update(0.016, 2.1, 1000);
  assert.equal(spine(scene).filter((c) => c.sOffset === 0).length, 2);
});

test('the spine never turns tighter than its own width allows, even on a hairpin', () => {
  const { scene, grower } = setup({ ...FAST, tendrilChance: 0, strandMin: 4000, strandMax: 4000, spineWidth: 24, turnRadius: 1.5 });
  grower.feed([...line(0, 300), ...line(0, 300, 6).reverse()]);
  grower.update(0.016, 0, 1000);
  const pts = spine(scene).flatMap((c) => c.points);
  let worst = 0;
  for (let i = 2; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const prevSeg = Math.hypot(pts[i - 1].x - pts[i - 2].x, pts[i - 1].y - pts[i - 2].y);
    if (seg < 1e-9 || prevSeg < 1e-9) continue; // seam points are shared between chunks
    const h1 = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x);
    const h2 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    let dh = Math.abs(h2 - h1);
    if (dh > Math.PI) dh = 2 * Math.PI - dh;
    worst = Math.max(worst, dh / seg);
  }
  assert.ok(worst <= 1 / (24 * 1.5) + 1e-6, `tightest radius ${1 / worst}px`);
});

test('a finished strand runs into its terminal at full width instead of pinching to a point', () => {
  const { scene, grower } = setup({ ...FAST, tendrilChance: 0, strandMin: 4000, strandMax: 4000 });
  grower.feed([...line(0, 300), { break: true }]);
  grower.update(0.016, 0, 1000);
  const last = spine(scene).at(-1);
  const [t] = tendrils(scene);
  assert.equal(last.head.ended, true);
  assert.equal(last.taperEnd, false);
  assert.equal(t.capStart, 'open');
  assert.deepEqual(t.spineRef, { seed: last.seed, g: last.head.s });
  const h = Math.atan2(t.points[1].y - t.points[0].y, t.points[1].x - t.points[0].x);
  assert.ok(Math.abs(h) < 0.05, `terminal leaves along the spine heading (h=${h})`);
});

test('a continuing strand starts inside the old tip, so no loose pointed tail shows beside it', () => {
  const { scene, grower } = setup({ ...FAST, tendrilChance: 0, strandMin: 300, strandMax: 300 });
  grower.feed(line(0, 700));
  grower.update(0.016, 0, 1000);
  const starts = spine(scene).filter((c) => c.sOffset === 0);
  const firstStrandEnd = spine(scene).filter((c) => c.head === starts[0].head).at(-1).points.at(-1);
  assert.deepEqual(starts[1].points[0], firstStrandEnd);
});
