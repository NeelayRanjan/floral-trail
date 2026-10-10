import { dist, ordered } from './geometry.js';
import { buildTendril, motifElement } from './tendril.js';
import { createNoise1D } from './noise.js';
import { smoothstep } from './shapes.js';

const MAX_PENDING = 2000;

function headingOf(points) {
  const a = points[0], b = points[points.length - 1];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

// Consumes the sampled cursor path and grows spine strands, spawning tendrils, frills and blooms.
export class Grower {
  constructor({ scene, grid, params, rng, motifs }) {
    this.scene = scene;
    this.grid = grid;
    this.params = params;
    this.rng = rng;
    this.motifs = motifs;
    this.noise = createNoise1D(99);
    this.hasMotif = (type) => this.motifs.has(this.params.motifSet, type);
    this.pickMotif = (type, rng) => this.motifs.pick(this.params.motifSet, type, rng);
    this.reset();
  }

  reset() {
    this.pending = [];
    this.strand = null;
    this.lastTarget = null;
    this.curTarget = null;
    this.lastBloomAt = -Infinity;
  }

  setRng(rng) {
    this.rng = rng;
  }

  feed(points) {
    for (const p of points) this.pending.push(p);
    if (this.pending.length > MAX_PENDING) {
      const last = this.pending.length - 1;
      this.pending = this.pending.filter((p, i) => p.break || i % 2 === 0 || i === last);
    }
  }

  // The tip chases the target path at growSpeed, so fast flicks become sweeps that keep growing.
  update(dt, now, cursorSpeed) {
    let budget = this.params.growSpeed * dt;
    while (this.pending.length) {
      const p = this.pending[0];
      if (p.break) {
        this.pending.shift();
        this.endStrand(now);
        this.lastTarget = null;
        continue;
      }
      if (!this.lastTarget) {
        this.pending.shift();
        this.lastTarget = p;
        continue;
      }
      const d = dist(this.lastTarget, p);
      if (d <= budget) {
        budget -= d;
        this.pending.shift();
        this.advance(this.lastTarget, p, now);
        this.lastTarget = p;
        continue;
      }
      if (budget > 0) {
        const u = budget / d;
        const q = { x: this.lastTarget.x + (p.x - this.lastTarget.x) * u, y: this.lastTarget.y + (p.y - this.lastTarget.y) * u };
        this.advance(this.lastTarget, q, now);
        this.lastTarget = q;
      }
      break;
    }
    this.maybeBloom(dt, now, cursorSpeed);
  }

  advance(a, b, now) {
    const len = dist(a, b);
    if (len < 1e-6) return;
    if (!this.strand) this.startStrand(a, a, now);
    const st = this.strand, P = this.params;
    st.sTarget += len;
    this.curTarget = b;
    const hx = (b.x - a.x) / len, hy = (b.y - a.y) / len;
    const ramp = smoothstep(0, 150, st.sTarget);
    const off = P.meanderAmp * ramp * this.noise(st.sTarget / Math.max(1, P.meanderWavelength) + st.seed);
    const fade = 1 - smoothstep(0, 200, st.sTarget);
    this.appendSpinePoint({ x: b.x - hy * off + st.carry.x * fade, y: b.y + hx * off + st.carry.y * fade }, now);
  }

  startStrand(pos, target, now) {
    const P = this.params, rng = this.rng;
    const [lo, hi] = ordered(P.strandMin, P.strandMax);
    this.strand = {
      seed: rng.range(0, 500), points: [pos], s: 0, sTarget: 0, length: rng.range(lo, hi),
      nextSpawn: Math.max(20, P.tendrilSpacing) * rng.range(0.5, 1), lastSide: rng.sign(),
      carry: { x: pos.x - target.x, y: pos.y - target.y }, chunk: null, chunks: [], head: { s: 0 },
    };
    this.ensureChunk(now);
  }

  // Spine growth inside one cohort window goes into one chunk; a new window starts a new chunk
  // that shares the seam point so the outline stays continuous.
  ensureChunk(now) {
    const st = this.strand, P = this.params;
    const cohort = this.scene.cohortFor('front', now, P.cohortWindow);
    if (st.chunk && st.chunk.cohort === cohort) return;
    const prevChunk = st.chunk;
    if (prevChunk) {
      prevChunk.taperEnd = false;
      this.scene.touch(prevChunk.cohort);
    }
    const last = st.points[st.points.length - 1];
    st.chunk = {
      kind: 'ribbon', role: 'spine', points: [last], cum: [0], sOffset: st.s, seed: st.seed,
      head: st.head, taperEnd: true, born: now, growDuration: 0,
      // Neighbours across the seam, so both chunks compute the same normal there.
      prev: prevChunk && prevChunk.points.length > 1 ? prevChunk.points[prevChunk.points.length - 2] : null,
      next: null, prevChunk,
    };
    st.chunks.push(st.chunk);
    this.scene.add(st.chunk, 'front', now, P.cohortWindow);
  }

  appendSpinePoint(q, now) {
    const st = this.strand, P = this.params;
    const prev = st.points[st.points.length - 1];
    const step = dist(prev, q);
    if (step < 0.5) return;
    this.ensureChunk(now);
    st.points.push(q);
    if (st.points.length > 8) st.points.shift();
    st.s += step;
    const ch = st.chunk;
    ch.cum.push(ch.cum[ch.cum.length - 1] + step);
    ch.points.push(q);
    if (ch.points.length === 2 && ch.prevChunk) {
      ch.prevChunk.next = q;
      this.scene.touch(ch.prevChunk.cohort);
      ch.prevChunk = null;
    }
    st.head.s = st.s;
    // Chunks inside the tip-taper zone change width as the head moves on.
    for (let i = st.chunks.length - 1; i >= 0; i--) {
      const c = st.chunks[i];
      if (c.sOffset + c.cum[c.cum.length - 1] < st.s - P.tipTaper - step) break;
      this.scene.touch(c.cohort);
    }
    while (st.s >= st.nextSpawn) {
      this.spawnAlongSpine(now);
      st.nextSpawn += Math.max(20, P.tendrilSpacing) * this.rng.range(0.7, 1.3);
    }
    if (st.s >= st.length) this.continueStrand(now);
  }

  tendrilOpts(extra) {
    return { params: this.params, rng: this.rng, hasMotif: this.hasMotif, pickMotif: this.pickMotif, scale: 1, ...extra };
  }

  addAll(els, track, now, at) {
    if (!els.length) return;
    els[0].cellKey = this.grid.add(at.x, at.y);
    for (const el of els) this.scene.add(el, track, now, this.params.cohortWindow);
  }

  crowded(at) {
    const P = this.params;
    return this.scene.count >= P.maxElements || this.grid.count(at.x, at.y) >= P.densityLimit;
  }

  spawnAlongSpine(now) {
    const st = this.strand, P = this.params, rng = this.rng;
    const tip = st.points[st.points.length - 1];
    if (this.crowded(tip)) return;
    const heading = headingOf(st.points);
    const side = rng.chance(P.alternateSides) ? -st.lastSide : st.lastSide;
    st.lastSide = side;
    if (rng.chance(P.tendrilChance)) {
      const track = rng.chance(P.backChance) ? 'back' : 'front';
      this.addAll(buildTendril(this.tendrilOpts({ x: tip.x, y: tip.y, heading, side, now })), track, now, tip);
    }
    if (P.frillChance > 0 && this.hasMotif('frill') && rng.chance(P.frillChance)) {
      const m = this.pickMotif('frill', rng);
      const half = P.spineWidth / 2;
      const nx = -Math.sin(heading) * -side, ny = Math.cos(heading) * -side;
      const angle = heading - side * (Math.PI / 2 - 0.7);
      this.addAll([motifElement(m, tip.x + nx * half, tip.y + ny * half, angle, 0.8, rng, now, 0.5)], 'front', now, tip);
    }
  }

  endStrand(now) {
    if (this.strand) this.finishStrand(now);
  }

  // Every free end gets a terminal: the strand tip turns into a short curling tendril.
  finishStrand(now) {
    const st = this.strand;
    this.strand = null;
    if (!st || st.s < 20) return;
    const tip = st.points[st.points.length - 1];
    const els = buildTendril(this.tendrilOpts({
      x: tip.x, y: tip.y, heading: headingOf(st.points), side: this.rng.sign(), scale: 0.9,
      length: this.rng.range(60, 140), loopBack: false, now,
    }));
    this.addAll(els, 'front', now, tip);
  }

  // Long strands end and a new one starts beside the old tip, overlapping it like the references.
  continueStrand(now) {
    const st = this.strand;
    const tip = st.points[st.points.length - 1];
    const heading = headingOf(st.points);
    const side = -st.lastSide;
    this.finishStrand(now);
    const off = this.params.spineWidth * 1.4 * side;
    const start = { x: tip.x - Math.sin(heading) * off, y: tip.y + Math.cos(heading) * off };
    this.startStrand(start, this.curTarget ?? tip, now);
  }

  maybeBloom(dt, now, speed) {
    const P = this.params, st = this.strand, rng = this.rng;
    if (!st || P.bloomRate <= 0 || !(speed < P.slowSpeed)) return;
    if (now - this.lastBloomAt < 0.8) return;
    if (!rng.chance(P.bloomRate * dt * (1 - speed / P.slowSpeed))) return;
    const type = this.hasMotif('bloom') ? 'bloom' : this.hasMotif('flower') ? 'flower' : null;
    if (!type) return;
    const tip = st.points[st.points.length - 1];
    if (this.crowded(tip)) return;
    this.lastBloomAt = now;
    const heading = headingOf(st.points);
    const side = rng.sign();
    const stem = buildTendril(this.tendrilOpts({
      x: tip.x, y: tip.y, heading, side, scale: 0.6, length: rng.range(50, 110), terminal: type, loopBack: false, now,
    }));
    const at = stem[0].points[stem[0].points.length - 1];
    const cluster = [];
    for (let i = 0; i < P.clusterTendrils; i++) {
      cluster.push(...buildTendril(this.tendrilOpts({
        x: at.x, y: at.y, heading: heading + (side * Math.PI) / 2 + rng.range(-1.4, 1.4), side: rng.sign(),
        scale: 0.45, terminal: rng.chance(0.5) ? 'curl' : 'ball', loopBack: false, now: now + 0.25 + i * 0.12,
      })));
    }
    this.addAll([...stem, ...cluster], 'front', now, tip);
  }
}
