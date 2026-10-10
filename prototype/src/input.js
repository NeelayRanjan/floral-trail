import { dist } from './geometry.js';

// Turns a stream of positions into evenly spaced path points; a { break: true } marker splits strands.
export class PathSampler {
  constructor(spacing = 3, jump = 220) {
    this.spacing = spacing;
    this.jump = jump;
    this.last = null;
    this.carry = 0;
    this.queue = [];
  }

  push(x, y) {
    const p = { x, y };
    if (!this.last) {
      this.last = p;
      this.carry = 0;
      this.queue.push({ x, y });
      return;
    }
    const d = dist(this.last, p);
    if (d > this.jump) {
      this.breakStrand();
      this.push(x, y);
      return;
    }
    let t = this.spacing - this.carry;
    while (t <= d) {
      const u = t / d;
      this.queue.push({ x: this.last.x + (x - this.last.x) * u, y: this.last.y + (y - this.last.y) * u });
      t += this.spacing;
    }
    this.carry = d - (t - this.spacing);
    this.last = p;
  }

  breakStrand() {
    if (this.last) this.queue.push({ break: true });
    this.last = null;
    this.carry = 0;
  }

  take() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}

// StreamLine-style stabiliser: two cascaded exponential filters (total time constant in ms), so the
// stroke glides behind the cursor, wobble is absorbed and corners come out rounded with no kink.
// Also keeps a smoothed speed estimate.
export class Smoother {
  constructor() {
    this.reset();
  }
  reset() {
    this.pos = null;
    this.mid = null;
    this.speed = 0;
  }
  update(target, dt, tauMs) {
    if (!this.pos) {
      this.pos = { x: target.x, y: target.y };
      this.mid = { x: target.x, y: target.y };
      return this.pos;
    }
    const a = tauMs <= 0 ? 1 : 1 - Math.exp((-dt * 1000) / (tauMs / 2));
    this.mid = { x: this.mid.x + (target.x - this.mid.x) * a, y: this.mid.y + (target.y - this.mid.y) * a };
    const next = { x: this.pos.x + (this.mid.x - this.pos.x) * a, y: this.pos.y + (this.mid.y - this.pos.y) * a };
    const v = dist(this.pos, next) / Math.max(dt, 1e-4);
    this.speed += (v - this.speed) * Math.min(1, dt * 8);
    this.pos = next;
    return next;
  }
}

// Synthetic cursor: a Lissajous wander with warped time so it alternates sweeps and near-stops.
export function autoDrawPosition(t, width, height, seed = 1) {
  const ph = seed * 1.618;
  const tt = 0.5 * t + 0.64 * Math.sin(0.75 * t + ph); // d(tt)/dt = 0.5 + 0.48 cos(...) > 0
  const x = width / 2 + width * 0.36 * Math.sin(tt * 0.9 + ph) + width * 0.08 * Math.sin(tt * 2.3 + ph * 2);
  const y = height / 2 + height * 0.32 * Math.sin(tt * 1.3 + ph * 0.5) + height * 0.06 * Math.cos(tt * 3.1);
  return { x, y };
}

export const clampDt = (raw) => Math.min(0.05, Math.max(0, raw));
