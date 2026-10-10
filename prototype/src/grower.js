import { dist, ordered } from './geometry.js';
import { buildTendril, motifElement } from './tendril.js';
import { createNoise1D } from './noise.js';
import { smoothstep } from './shapes.js';

const MAX_LAG = 0.5; // seconds the tip may trail the cursor path before growth speeds up
const IDLE_END = 0.6; // seconds without growth before a strand ends in its terminal

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
    this.pendingLen = 0;
    this.lastFed = null;
    this.strand = null;
    this.lastTarget = null;
    this.lastTip = null;
    this.lastBloomAt = -Infinity;
  }

  setRng(rng) {
    this.rng = rng;
  }

  feed(points) {
    for (const p of points) {
      this.pending.push(p);
      if (p.break) {
        this.lastFed = null;
      } else {
        if (this.lastFed) this.pendingLen += dist(this.lastFed, p);
        this.lastFed = p;
      }
    }
  }

  // The tip chases the target path at growSpeed, so fast flicks become sweeps that keep growing
  // briefly. A long backlog speeds growth up so the vine never trails by more than ~MAX_LAG.
  update(dt, now, cursorSpeed) {
    let budget = Math.max(this.params.growSpeed, this.pendingLen / MAX_LAG) * dt;
    while (this.pending.length) {
      const p = this.pending[0];
      if (p.break) {
        this.pending.shift();
        this.endStrand(now);
        this.lastTarget = null;
        this.lastTip = null;
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
        this.pendingLen -= d;
        this.pending.shift();
        this.advance(this.lastTarget, p, now);
        this.lastTarget = p;
        continue;
      }
      if (budget > 0) {
        const u = budget / d;
        const q = { x: this.lastTarget.x + (p.x - this.lastTarget.x) * u, y: this.lastTarget.y + (p.y - this.lastTarget.y) * u };
        this.pendingLen -= budget;
        this.advance(this.lastTarget, q, now);
        this.lastTarget = q;
      }
      break;
    }
    if (!this.pending.length) this.pendingLen = 0;
    // A resting tip becomes a finished end, so the next stroke starts a fresh, tapered strand.
    if (this.strand && now - this.strand.lastGrowAt > IDLE_END) this.endStrand(now);
    this.maybeBloom(dt, now, cursorSpeed);
  }

  // The tip steers toward the (meandering) target with a limited turn rate (turnRadius × width),
  // so bends stay round on both edges and the ribbon cannot crease or fold on sharp reversals.
  advance(a, b, now) {
    const len = dist(a, b);
    if (len < 1e-6) return;
    const P = this.params;
    if (!this.strand) this.startStrand(a, Math.atan2(b.y - a.y, b.x - a.x), now);
    const st = this.strand;
    st.sTarget += len;
    const hx = (b.x - a.x) / len, hy = (b.y - a.y) / len;
    const off = P.meanderAmp * smoothstep(0, 150, st.sTarget)
      * this.noise(st.sTarget / Math.max(1, P.meanderWavelength) + st.seed);
    const want = { x: b.x - hy * off, y: b.y + hx * off };
    const d = dist(st.tip, want);
    if (d < 0.5) return;
    const stepLen = Math.min(d, len * 1.5);
    const minRadius = Math.max(4, P.spineWidth * P.turnRadius);
    const raw = Math.atan2(want.y - st.tip.y, want.x - st.tip.x) - st.heading;
    const dh = Math.atan2(Math.sin(raw), Math.cos(raw));
    const maxTurn = stepLen / minRadius;
    st.heading += Math.max(-maxTurn, Math.min(maxTurn, dh));
    this.appendSpinePoint({ x: st.tip.x + Math.cos(st.heading) * stepLen, y: st.tip.y + Math.sin(st.heading) * stepLen }, now);
  }

  startStrand(pos, heading, now) {
    const P = this.params, rng = this.rng;
    const [lo, hi] = ordered(P.strandMin, P.strandMax);
    this.strand = {
      seed: rng.range(0, 500), tip: pos, heading, s: 0, sTarget: 0, length: rng.range(lo, hi),
      nextSpawn: Math.max(20, P.tendrilSpacing) * rng.range(0.5, 1), lastSide: rng.sign(),
      chunk: null, chunks: [], head: { s: 0, ended: false }, lastGrowAt: now,
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
    st.chunk = {
      kind: 'ribbon', role: 'spine', points: [st.tip], cum: [0], sOffset: st.s, seed: st.seed,
      head: st.head, taperEnd: true, born: now, growDuration: 0,
      // Neighbours across the seam, so both chunks compute the same normal there.
      prev: prevChunk && prevChunk.points.length > 1 ? prevChunk.points[prevChunk.points.length - 2] : null,
      next: null, prevChunk,
    };
    st.chunks.push(st.chunk);
    this.scene.add(st.chunk, 'front', now, P.cohortWindow);
  }

  // Chunks whose end lies inside the tip-taper zone change width when the head moves or ends.
  touchTaperZone(st, slack) {
    for (let i = st.chunks.length - 1; i >= 0; i--) {
      const c = st.chunks[i];
      if (c.sOffset + c.cum[c.cum.length - 1] < st.s - this.params.tipTaper - slack) break;
      this.scene.touch(c.cohort);
    }
  }

  appendSpinePoint(q, now) {
    const st = this.strand, P = this.params;
    const step = dist(st.tip, q);
    if (step < 0.5) return;
    this.ensureChunk(now);
    st.tip = q;
    st.s += step;
    st.lastGrowAt = now;
    this.lastTip = { x: q.x, y: q.y, heading: st.heading };
    const ch = st.chunk;
    ch.cum.push(ch.cum[ch.cum.length - 1] + step);
    ch.points.push(q);
    if (ch.points.length === 2 && ch.prevChunk) {
      ch.prevChunk.next = q;
      this.scene.touch(ch.prevChunk.cohort);
      ch.prevChunk = null;
    }
    st.head.s = st.s;
    this.touchTaperZone(st, step);
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
    const tip = st.tip;
    if (this.crowded(tip)) return;
    const heading = st.heading;
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

  // Every free end gets a terminal: the strand runs straight into a curling tendril that starts
  // at the spine's own width, so the end neither pinches to a point nor shows a shoulder.
  finishStrand(now) {
    const st = this.strand;
    this.strand = null;
    if (!st || st.s < 20) return;
    st.head.ended = true;
    st.chunk.taperEnd = false;
    this.touchTaperZone(st, 1);
    const els = buildTendril(this.tendrilOpts({
      x: st.tip.x, y: st.tip.y, heading: st.heading, side: this.rng.sign(), depart: 0, scale: 0.9,
      length: this.rng.range(60, 140), loopBack: false, now,
    }));
    els[0].capStart = 'open';
    els[0].spineRef = { seed: st.seed, g: st.s };
    this.addAll(els, 'front', now, st.tip);
  }

  // Long strands end in a terminal and a new one starts from inside the old tip: its tapered tail
  // is hidden in the old ribbon, so the two part ways as a smooth fork with no loose point.
  continueStrand(now) {
    const st = this.strand;
    const tip = st.tip, heading = st.heading;
    this.finishStrand(now);
    this.startStrand({ x: tip.x, y: tip.y }, heading, now);
  }

  maybeBloom(dt, now, speed) {
    const P = this.params, st = this.strand, rng = this.rng;
    const tip = st ? { x: st.tip.x, y: st.tip.y, heading: st.heading } : this.lastTip;
    if (!tip || P.bloomRate <= 0 || !(speed < P.slowSpeed)) return;
    if (now - this.lastBloomAt < 0.8) return;
    if (!rng.chance(P.bloomRate * dt * (1 - speed / P.slowSpeed))) return;
    const type = this.hasMotif('bloom') ? 'bloom' : this.hasMotif('flower') ? 'flower' : null;
    if (!type) return;
    if (this.crowded(tip)) return;
    this.lastBloomAt = now;
    const side = rng.sign();
    const stem = buildTendril(this.tendrilOpts({
      x: tip.x, y: tip.y, heading: tip.heading, side, scale: 0.6, length: rng.range(50, 110), terminal: type, loopBack: false, now,
    }));
    const at = stem[0].points[stem[0].points.length - 1];
    const cluster = [];
    for (let i = 0; i < P.clusterTendrils; i++) {
      cluster.push(...buildTendril(this.tendrilOpts({
        x: at.x, y: at.y, heading: tip.heading + (side * Math.PI) / 2 + rng.range(-1.4, 1.4), side: rng.sign(),
        scale: 0.45, terminal: rng.chance(0.5) ? 'curl' : 'ball', loopBack: false, now: now + 0.25 + i * 0.12,
      })));
    }
    this.addAll([...stem, ...cluster], 'front', now, tip);
  }
}
