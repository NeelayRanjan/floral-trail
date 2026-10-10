import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../prototype/src/rng.js';
import { presetValues } from '../prototype/src/presets.js';
import { buildTendril, pickTerminal } from '../prototype/src/tendril.js';

const P = {
  ...presetValues('ribbon'),
  departMin: 35, departMax: 35, lengthMin: 300, lengthMax: 300, curlRadius: 14, curlRamp: 3,
  subTendrilChance: 0, frillChance: 0, droop: 0, bodyBend: 0.6,
};
const flower = { id: 'f1', type: 'flower', baseSize: 20 };
const frill = { id: 'r1', type: 'frill', baseSize: 10 };
const noMotifs = { hasMotif: () => false, pickMotif: () => null };
const build = (over = {}, seed = 1) =>
  buildTendril({ x: 0, y: 0, heading: 0, side: 1, params: P, rng: createRng(seed), now: 0, ...noMotifs, ...over });

test('the first element is a tendril ribbon of the requested length', () => {
  const [r] = build({ terminal: 'curl' });
  assert.equal(r.kind, 'ribbon');
  assert.equal(r.role, 'tendril');
  assert.ok(Math.abs(r.cum.at(-1) - 300) < 1e-6);
  assert.equal(r.points.length, r.cum.length);
});

test('a loop-back tendril crosses back over its parent line', () => {
  const [r] = build({ loopBack: true, terminal: 'curl' });
  assert.ok(r.points[5].y > 0, 'starts on its own side');
  assert.ok(Math.min(...r.points.map((p) => p.y)) < -5, 'crosses to the other side');
});

test('an outward-curling tendril stays on its own side', () => {
  const [r] = build({ loopBack: false, terminal: 'curl', params: { ...P, outwardCurlChance: 1 } });
  assert.ok(r.points.every((p) => p.y >= -0.5));
  assert.ok(r.points.at(-1).y > 0);
});

test('a ball terminal adds a blob at the tip that appears after the ribbon', () => {
  const els = build({ terminal: 'ball' });
  const blob = els.find((e) => e.kind === 'blob');
  const tip = els[0].points.at(-1);
  assert.deepEqual([blob.x, blob.y], [tip.x, tip.y]);
  assert.ok(blob.born > els[0].born);
});

test('a flower terminal adds a motif when one is available', () => {
  const els = build({ terminal: 'flower', hasMotif: (t) => t === 'flower', pickMotif: () => flower });
  const m = els.find((e) => e.kind === 'motif');
  assert.equal(m.id, 'f1');
  assert.ok(m.size >= 20 * 0.85 && m.size <= 20 * 1.15);
});

test('pickTerminal ignores motif kinds that have no motifs and falls back to curl', () => {
  const rng = createRng(4);
  const onlyFlower = { ...P, wCurl: 0, wBall: 0, wHook: 0, wBud: 0, wLeaf: 0, wFlower: 5 };
  for (let i = 0; i < 50; i++) assert.equal(pickTerminal(onlyFlower, rng, () => false), 'curl');
  const none = { ...onlyFlower, wFlower: 0 };
  assert.equal(pickTerminal(none, rng, () => true), 'curl');
});

test('sub-tendrils recurse only one level', () => {
  const els = build({ terminal: 'curl', params: { ...P, subTendrilChance: 1 } });
  const ribbons = els.filter((e) => e.kind === 'ribbon');
  assert.equal(ribbons.length, 2);
  assert.ok(ribbons[1].scale < 1);
  assert.ok(ribbons[1].born > ribbons[0].born);
});

test('frills are placed along the body when frill motifs exist', () => {
  const els = build({
    terminal: 'curl',
    params: { ...P, frillChance: 1, frillSpacing: 40 },
    hasMotif: (t) => t === 'frill',
    pickMotif: () => frill,
  });
  assert.ok(els.filter((e) => e.kind === 'motif' && e.id === 'r1').length >= 2);
});

test('same seed builds the same tendril', () => {
  assert.equal(JSON.stringify(build({}, 5)), JSON.stringify(build({}, 5)));
});

test('an explicit depart angle overrides the random departure', () => {
  const [r] = build({ depart: 0, loopBack: false, terminal: 'curl' });
  const h = Math.atan2(r.points[1].y - r.points[0].y, r.points[1].x - r.points[0].x);
  assert.ok(Math.abs(h) < 0.02, `h=${h}`);
});

test('a tendril peels off along its parent and reaches the departure angle gradually', () => {
  const [r] = build({ loopBack: false, terminal: 'curl', params: { ...P, outwardCurlChance: 1, peel: 0.3 } });
  const headingAt = (i) => Math.atan2(r.points[i].y - r.points[i - 1].y, r.points[i].x - r.points[i - 1].x);
  assert.ok(Math.abs(headingAt(1)) < 0.1, `starts tangent to the parent (h=${headingAt(1)})`);
  const i35 = Math.round(r.points.length * 0.35);
  assert.ok(headingAt(i35) > 0.55, `has turned out by 35% of its length (h=${headingAt(i35)})`);
});

test('with peel 0 a tendril leaves at the departure angle immediately', () => {
  const [r] = build({ loopBack: false, terminal: 'curl', params: { ...P, outwardCurlChance: 1, peel: 0 } });
  const h = Math.atan2(r.points[1].y - r.points[0].y, r.points[1].x - r.points[0].x);
  assert.ok(Math.abs(h - 35 * Math.PI / 180) < 0.05, `h=${h}`);
});
