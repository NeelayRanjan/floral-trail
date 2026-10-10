// Polyline math in screen space (y down). Normals are the tangent rotated +90°.

export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const ordered = (a, b) => (a <= b ? [a, b] : [b, a]);

export function cumulativeLengths(points) {
  const cum = new Array(points.length);
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) s += dist(points[i - 1], points[i]);
    cum[i] = s;
  }
  return cum;
}

// Evenly respaced copy of a polyline (by arc length); keeps the first and last points.
export function resample(points, spacing) {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const out = [{ x: points[0].x, y: points[0].y }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = dist(a, b);
    let t = spacing - carry;
    while (t <= seg) {
      const u = t / seg;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      t += spacing;
    }
    carry = seg - (t - spacing);
  }
  const last = points[points.length - 1];
  if (dist(out[out.length - 1], last) > 1e-6) out.push({ x: last.x, y: last.y });
  return out;
}

function tangentAt(points, i) {
  const n = points.length;
  const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export function normals(points) {
  return points.map((_, i) => {
    const t = tangentAt(points, i);
    return { x: -t.y, y: t.x };
  });
}

export function sampleAt(points, cum, s) {
  const n = points.length;
  if (n === 1) return { point: { x: points[0].x, y: points[0].y }, heading: 0, normal: { x: 0, y: 1 } };
  let i = 1;
  while (i < n - 1 && cum[i] < s) i++;
  const a = points[i - 1], b = points[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const u = Math.min(1, Math.max(0, (s - cum[i - 1]) / seg));
  const heading = Math.atan2(b.y - a.y, b.x - a.x);
  return {
    point: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u },
    heading,
    normal: { x: -Math.sin(heading), y: Math.cos(heading) },
  };
}

// Prefix of a polyline up to arc length `len`, interpolating the final point.
export function truncate(points, cum, len) {
  const n = points.length;
  if (len >= cum[n - 1]) return { points, cum };
  let i = 0;
  while (i < n - 1 && cum[i + 1] <= len) i++;
  const outP = points.slice(0, i + 1);
  const outC = cum.slice(0, i + 1);
  if (len > cum[i] && i < n - 1) {
    const a = points[i], b = points[i + 1];
    const u = (len - cum[i]) / (cum[i + 1] - cum[i]);
    outP.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    outC.push(len);
  }
  return { points: outP, cum: outC };
}

// Integrates a curve from (x, y). curvature(s) is in 1/px; positive turns toward +normal.
// droop pulls the heading toward straight down (screen +y).
export function curvePath({ x, y, heading, length, curvature, droop = 0, step = 3 }) {
  const points = [{ x, y }];
  let h = heading;
  const n = Math.max(1, Math.ceil(length / step));
  const ds = length / n;
  for (let i = 1; i <= n; i++) {
    h += curvature((i - 0.5) * ds) * ds;
    if (droop) h += droop * (ds / 100) * Math.sin(Math.PI / 2 - h);
    x += Math.cos(h) * ds;
    y += Math.sin(h) * ds;
    points.push({ x, y });
  }
  return { points, endHeading: h };
}

export function ribbonSides(points, halfL, halfR) {
  const ns = normals(points);
  const left = [], right = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], n = ns[i];
    left.push({ x: p.x + n.x * halfL[i], y: p.y + n.y * halfL[i] });
    right.push({ x: p.x - n.x * halfR[i], y: p.y - n.y * halfR[i] });
  }
  return { left, right };
}

const CAP_SEGMENTS = 12;

// Semicircle from `from` to `to` bulging along `tangent` (endpoints excluded).
function roundCap(from, to, tangent) {
  const c = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const r = dist(from, to) / 2;
  if (r < 1e-6) return [];
  const ux = (from.x - c.x) / r, uy = (from.y - c.y) / r;
  const out = [];
  for (let k = 1; k < CAP_SEGMENTS; k++) {
    const th = (k / CAP_SEGMENTS) * Math.PI;
    out.push({
      x: c.x + r * (ux * Math.cos(th) + tangent.x * Math.sin(th)),
      y: c.y + r * (uy * Math.cos(th) + tangent.y * Math.sin(th)),
    });
  }
  return out;
}

// Closed outline polygon (for filling) plus stroke runs that skip 'open' ends,
// so chunks of one ribbon drawn in different buffers join without a seam line.
export function ribbonOutline(points, left, right, capStart, capEnd) {
  const n = points.length;
  const endTan = tangentAt(points, n - 1);
  const startTan = tangentAt(points, 0);
  const endCap = capEnd === 'round' ? roundCap(left[n - 1], right[n - 1], endTan) : [];
  const startCap = capStart === 'round' ? roundCap(right[0], left[0], { x: -startTan.x, y: -startTan.y }) : [];
  const rightRev = right.slice().reverse();
  const polygon = [...left, ...endCap, ...rightRev, ...startCap];
  let runs;
  if (capStart !== 'open' && capEnd !== 'open') runs = [{ points: polygon, closed: true }];
  else if (capStart === 'open' && capEnd === 'open') runs = [{ points: left, closed: false }, { points: rightRev, closed: false }];
  else if (capEnd === 'open') runs = [{ points: [...rightRev, ...startCap, ...left], closed: false }];
  else runs = [{ points: [...left, ...endCap, ...rightRev], closed: false }];
  return { polygon, runs };
}
