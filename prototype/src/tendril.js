import { curvePath, cumulativeLengths, sampleAt, ordered } from './geometry.js';
import { tendrilHalfWidth } from './shapes.js';

const DEG = Math.PI / 180;
export const TERMINALS = ['curl', 'ball', 'hook', 'bud', 'leaf', 'flower'];
const WEIGHT_KEYS = { curl: 'wCurl', ball: 'wBall', hook: 'wHook', bud: 'wBud', leaf: 'wLeaf', flower: 'wFlower' };
const PROCEDURAL = new Set(['curl', 'ball', 'hook']);

export function pickTerminal(params, rng, hasMotif) {
  const entries = TERMINALS.map((t) => [t, PROCEDURAL.has(t) || hasMotif(t) ? params[WEIGHT_KEYS[t]] : 0]);
  return rng.weighted(entries) ?? 'curl';
}

// Body curvature k0 ramping to k1 near the end with exponent p (higher p = later, tighter scroll).
export function curvatureProfile(length, k0, k1, p) {
  return (s) => k0 + (k1 - k0) * Math.pow(Math.min(1, Math.max(0, s / length)), p);
}

export function motifElement(motif, x, y, angle, scale, rng, born, growDuration) {
  return {
    kind: 'motif', id: motif.id, x, y, angle,
    size: motif.baseSize * scale * rng.range(0.85, 1.15),
    flip: rng.sign(), born, growDuration,
  };
}

export function buildTendril(opts) {
  const { x, y, heading, side, params: P, rng, now, hasMotif, pickMotif } = opts;
  const scale = opts.scale ?? 1;
  const depth = opts.depth ?? 0;
  const [lenLo, lenHi] = ordered(P.lengthMin, P.lengthMax);
  const length = Math.max(12, (opts.length ?? rng.range(lenLo, lenHi)) * scale);
  const [dLo, dHi] = ordered(P.departMin, P.departMax);
  const depart = opts.depart ?? rng.range(dLo, dHi) * DEG;
  const terminal = opts.terminal ?? pickTerminal(P, rng, hasMotif);
  const loopBack = opts.loopBack ?? rng.chance(P.loopBackChance);

  // Loop-back: an arc that turns 2*depart (+ margin) back toward the parent, crossing it.
  const bend = loopBack
    ? (-side * (2 * depart + 0.6)) / (0.75 * length)
    : ((rng.chance(P.outwardCurlChance) ? side : -side) * P.bodyBend) / length;
  const turn = Math.sign(bend) || side;
  const curlR = Math.max(1, P.curlRadius * Math.sqrt(scale));
  let k1 = bend, p = 1;
  if (terminal === 'curl' || terminal === 'ball') { k1 = turn / curlR; p = P.curlRamp; }
  else if (terminal === 'hook') { k1 = turn / (curlR * 0.8); p = P.curlRamp * 2.5; }
  const curvature = curvatureProfile(length, bend, k1, p);
  const { points, endHeading } = curvePath({ x, y, heading: heading + side * depart, length, curvature, droop: P.droop });
  const growDuration = P.growTime * rng.range(0.8, 1.2) * Math.sqrt(scale);
  const ribbon = {
    kind: 'ribbon', role: 'tendril', points, cum: cumulativeLengths(points), length, scale, terminal,
    seed: rng.range(0, 500), born: now, growDuration, capStart: 'flat', capEnd: 'round',
  };
  const out = [ribbon];

  const end = points[points.length - 1];
  const endBorn = now + growDuration * 0.85;
  if (terminal === 'ball') {
    out.push({ kind: 'blob', x: end.x, y: end.y, rel: scale, born: endBorn, growDuration: 0.35 });
  } else if (!PROCEDURAL.has(terminal)) {
    const m = pickMotif(terminal, rng);
    if (m) out.push(motifElement(m, end.x, end.y, endHeading, Math.sqrt(scale), rng, endBorn, 0.6));
  }

  if (P.frillChance > 0 && hasMotif('frill')) {
    const spacing = Math.max(10, P.frillSpacing) * scale;
    for (let s = length * 0.2; s < length * 0.85; s += spacing * rng.range(0.7, 1.3)) {
      if (!rng.chance(P.frillChance)) continue;
      const at = sampleAt(points, ribbon.cum, s);
      const k = curvature(s);
      const outer = k === 0 ? rng.sign() : -Math.sign(k);
      const half = tendrilHalfWidth(P, scale, s / length);
      const m = pickMotif('frill', rng);
      out.push(motifElement(
        m,
        at.point.x + at.normal.x * outer * half,
        at.point.y + at.normal.y * outer * half,
        at.heading + outer * (Math.PI / 2 - 0.7),
        0.6 * scale, rng, now + growDuration * (s / length), 0.5,
      ));
    }
  }

  if (depth === 0 && rng.chance(P.subTendrilChance)) {
    const s = length * rng.range(0.3, 0.6);
    const at = sampleAt(points, ribbon.cum, s);
    const k = curvature(s);
    out.push(...buildTendril({
      ...opts, x: at.point.x, y: at.point.y, heading: at.heading,
      side: k === 0 ? rng.sign() : -Math.sign(k), scale: scale * 0.55, depth: 1,
      terminal: undefined, length: undefined, depart: undefined, loopBack: false,
      now: now + growDuration * (s / length),
    }));
  }
  return out;
}
