import { ribbonSides, ribbonOutline, truncate } from './geometry.js';

export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export function smoothstep(a, b, x) {
  if (b === a) return x >= b ? 1 : 0;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
// Brush-like taper: pointed at d = 0, full width by d = len.
const sineTaper = (d, len) => (len > 0 ? Math.sin(clamp01(d / len) * Math.PI / 2) : 1);

export function growProgress(el, now) {
  if (now < el.born) return 0;
  if (!(el.growDuration > 0)) return 1;
  return clamp01((now - el.born) / el.growDuration);
}

// g = arc length from the strand start; distToEnd = arc length to the strand's head
// (Infinity when this point is not near a free end).
export function spineHalfWidth(params, noise, el, g, distToEnd) {
  let half = 0.5 * params.spineWidth * Math.max(0.15, 1 + params.widthNoise * noise(g / 180 + el.seed * 3.1));
  half *= sineTaper(g, params.tailTaper);
  half *= sineTaper(distToEnd, params.tipTaper);
  return half;
}

export function tendrilHalfWidth(params, scale, t) {
  const start = 0.5 * params.spineWidth * params.tendrilWidth * scale;
  return start * (1 + (params.tendrilEndWidth - 1) * Math.pow(clamp01(t), 0.8));
}

function wobble(params, noise, g, seed) {
  return params.wobbleLow * noise(g / Math.max(1, params.wobbleLowWave) + seed)
    + params.roughness * noise(g / Math.max(0.5, params.roughnessWave) + seed + 211);
}

export function ribbonShape(el, params, noise, now) {
  const isSpine = el.role === 'spine';
  let points = el.points, cum = el.cum, growTaper = 0;
  if (!isSpine) {
    const p = easeOutCubic(growProgress(el, now));
    if (p <= 0) return null;
    if (p < 1) ({ points, cum } = truncate(el.points, el.cum, el.length * p));
    growTaper = 1 - smoothstep(0.8, 1, p);
  }
  const n = points.length;
  if (n < 2) return null;
  const total = cum[n - 1];
  const halfL = new Array(n), halfR = new Array(n);
  const seedL = el.seed * 13.7, seedR = seedL + 400;
  for (let i = 0; i < n; i++) {
    const s = cum[i];
    const g = isSpine ? el.sOffset + s : s;
    let half;
    if (isSpine) {
      // The tip taper is measured from the strand head, so it can span several chunks.
      const distToEnd = el.head ? el.head.s - g : el.taperEnd ? total - s : Infinity;
      half = spineHalfWidth(params, noise, el, g, distToEnd);
    }
    else {
      half = tendrilHalfWidth(params, el.scale, s / el.length);
      if (growTaper > 0) half *= 1 - growTaper * (1 - sineTaper(total - s, 30 * el.scale));
    }
    const f = Math.min(1, half / 2); // keep wobble from fattening tapered points
    halfL[i] = Math.max(0, half + f * wobble(params, noise, g, seedL));
    halfR[i] = Math.max(0, half + f * wobble(params, noise, g, seedR));
  }
  const { left, right } = ribbonSides(points, halfL, halfR);
  const capStart = isSpine ? (el.sOffset === 0 ? 'flat' : 'open') : el.capStart;
  const capEnd = isSpine ? (el.taperEnd ? 'flat' : 'open') : el.capEnd;
  const { polygon, runs } = ribbonOutline(points, left, right, capStart, capEnd);
  return { fill: { rings: [polygon], rule: 'nonzero' }, runs, ink: null };
}

export function blobShape(el, params, noise, now) {
  const p = growProgress(el, now);
  if (p <= 0) return null;
  const r = el.rel * params.ballSize * params.spineWidth * params.tendrilWidth * 0.5 * Math.max(0, easeOutBack(p));
  if (r < 0.3) return null;
  const ring = [];
  const N = 28;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r + params.roughness * noise(a * 3 + el.x * 0.01);
    ring.push({ x: el.x + Math.cos(a) * rr, y: el.y + Math.sin(a) * rr });
  }
  return { fill: { rings: [ring], rule: 'nonzero' }, runs: [{ points: ring, closed: true }], ink: null };
}

export function motifShape(el, motif, params, now) {
  if (!motif) return null;
  const p = growProgress(el, now);
  if (p <= 0) return null;
  const size = el.size * params.motifScale * Math.max(0, easeOutBack(p));
  if (size < 0.5) return null;
  const ca = Math.cos(el.angle), sa = Math.sin(el.angle);
  const tf = ([u, v]) => {
    const vv = v * el.flip;
    return { x: el.x + (u * ca - vv * sa) * size, y: el.y + (u * sa + vv * ca) * size };
  };
  const rings = motif.silhouette.map((r) => r.map(tf));
  const ink = motif.ink && motif.ink.length ? motif.ink.map((r) => r.map(tf)) : null;
  return { fill: { rings, rule: 'evenodd' }, runs: rings.map((points) => ({ points, closed: true })), ink };
}

export function shapeBounds(shapes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (pts) => {
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  };
  for (const s of shapes) {
    for (const r of s.fill.rings) visit(r);
    for (const run of s.runs) visit(run.points);
    if (s.ink) for (const r of s.ink) visit(r);
  }
  return { minX, minY, maxX, maxY };
}
