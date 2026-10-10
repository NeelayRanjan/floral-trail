import { ribbonShape, blobShape, motifShape, shapeBounds } from './shapes.js';
import { cohortAlpha, ageStep } from './scene.js';
import { createNoise1D } from './noise.js';
import { mixHex } from './colour.js';

const AGE_STEPS = 8;

function tracePoly(path, pts, closed) {
  if (pts.length < 2) return;
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  if (closed) path.closePath();
}

function fit(canvas, pw, ph) {
  const c = canvas || document.createElement('canvas');
  if (c.width < pw || c.height < ph) {
    c.width = Math.max(pw, Math.ceil(c.width * 1.25));
    c.height = Math.max(ph, Math.ceil(c.height * 1.25));
  }
  return c;
}

function reset(g, pw, ph) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.filter = 'none';
  g.clearRect(0, 0, pw, ph);
}

// Each shape is filled separately: winding directions differ between shapes, so one shared
// nonzero path could cancel overlaps into holes.
function fillInteriors(g, shapes) {
  for (const s of shapes) {
    const p = new Path2D();
    for (const r of s.fill.rings) tracePoly(p, r, true);
    g.fill(p, s.fill.rule);
  }
}

// Stroke at 2× ink weight, then erase (or paint over) interiors: only the outer edge of the
// union of all shapes survives, so overlapping ribbons fuse.
function drawShapes(g, shapes, P, colour, cut) {
  g.lineJoin = 'round';
  // Butt caps: open runs end exactly at chunk seams instead of poking past them.
  g.lineCap = 'butt';
  g.strokeStyle = colour;
  g.lineWidth = P.inkWeight * 2;
  const outline = new Path2D();
  for (const s of shapes) for (const run of s.runs) tracePoly(outline, run.points, run.closed);
  g.stroke(outline);
  if (cut) {
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
  } else {
    g.fillStyle = P.fill;
  }
  fillInteriors(g, shapes);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = colour;
  const ink = new Path2D();
  let any = false;
  for (const s of shapes) if (s.ink) for (const r of s.ink) { tracePoly(ink, r, true); any = true; }
  if (any) g.fill(ink, 'evenodd');
}

export class Renderer {
  constructor(canvas, { scene, params, motifs }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = scene;
    this.params = params;
    this.motifs = motifs;
    this.noise = createNoise1D(7);
    this.scratch = null;
    this.paramsVersion = 0;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
  }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.invalidate();
  }

  invalidate() {
    this.paramsVersion++;
  }

  render(now) {
    const { ctx, params: P, dpr } = this;
    reset(ctx, this.canvas.width, this.canvas.height);
    const cohorts = this.scene.cohorts;
    const ordered = [...cohorts.filter((c) => c.track === 'back'), ...cohorts.filter((c) => c.track === 'front')];
    for (const c of ordered) {
      const age = now - c.start;
      const alpha = cohortAlpha(age, P.lifetime, P.fadeStart);
      if (alpha <= 0) continue;
      const step = ageStep(age, P.lifetime, AGE_STEPS);
      const rs = c.renderState || (c.renderState = { version: -1, step: -1, paramsVersion: -1, bbox: null });
      if (this.scene.isGrowing(c, now) || rs.version !== c.version || rs.step !== step || rs.paramsVersion !== this.paramsVersion) {
        this.renderCohort(c, rs, now, step);
        rs.version = c.version;
        rs.step = step;
        rs.paramsVersion = this.paramsVersion;
      }
      if (!rs.bbox) continue;
      const dx = Math.round(rs.bbox.x * dpr), dy = Math.round(rs.bbox.y * dpr);
      ctx.globalAlpha = alpha;
      if (rs.mask) {
        // Occlusion: newer growth hides older lines beneath its interiors.
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(rs.mask, 0, 0, rs.pw, rs.ph, dx, dy, rs.pw, rs.ph);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(rs.lines, 0, 0, rs.pw, rs.ph, dx, dy, rs.pw, rs.ph);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  shapeFor(el, now) {
    if (el.kind === 'ribbon') return ribbonShape(el, this.params, this.noise, now);
    if (el.kind === 'blob') return blobShape(el, this.params, this.noise, now);
    if (el.kind === 'motif') return motifShape(el, this.motifs.get(el.id), this.params, now);
    return null;
  }

  colourFor(track, step) {
    const P = this.params;
    const base = track === 'back' ? P.backMix : 0;
    return mixHex(P.ink, P.paper, base + (1 - base) * P.ageTint * (step / AGE_STEPS));
  }

  renderCohort(c, rs, now, step) {
    const P = this.params, dpr = this.dpr;
    const shapes = [];
    for (const el of c.elements) {
      const s = this.shapeFor(el, now);
      if (s) shapes.push(s);
    }
    if (!shapes.length) {
      rs.bbox = null;
      return;
    }
    const blur = P.blurMax * (step / AGE_STEPS) + (c.track === 'back' ? P.blurMax * 0.5 : 0);
    const pad = P.inkWeight * 2 + blur * 3 + 4;
    const b = shapeBounds(shapes);
    const x0 = Math.floor(b.minX - pad), y0 = Math.floor(b.minY - pad);
    const pw = Math.ceil((Math.ceil(b.maxX + pad) - x0) * dpr);
    const ph = Math.ceil((Math.ceil(b.maxY + pad) - y0) * dpr);
    const cut = P.fillMode !== 'fill';
    rs.lines = fit(rs.lines, pw, ph);
    rs.mask = cut ? fit(rs.mask, pw, ph) : null;
    rs.bbox = { x: x0, y: y0 };
    rs.pw = pw;
    rs.ph = ph;
    const colour = this.colourFor(c.track, step);

    const g = rs.lines.getContext('2d');
    reset(g, pw, ph);
    g.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
    drawShapes(g, shapes, P, colour, cut);
    if (blur > 0.05) this.blurInPlace(rs.lines, pw, ph, blur * dpr);

    if (cut) {
      const m = rs.mask.getContext('2d');
      reset(m, pw, ph);
      m.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
      m.fillStyle = '#000';
      fillInteriors(m, shapes);
    }
  }

  // Re-rendered from crisp shapes at every age step, so blur never accumulates.
  blurInPlace(canvas, pw, ph, px) {
    this.scratch = fit(this.scratch, pw, ph);
    const sg = this.scratch.getContext('2d');
    reset(sg, pw, ph);
    sg.drawImage(canvas, 0, 0, pw, ph, 0, 0, pw, ph);
    const g = canvas.getContext('2d');
    reset(g, pw, ph);
    g.filter = `blur(${px.toFixed(2)}px)`;
    g.drawImage(this.scratch, 0, 0, pw, ph, 0, 0, pw, ph);
    g.filter = 'none';
  }
}
