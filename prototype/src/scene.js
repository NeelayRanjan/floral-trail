// Elements are grouped into cohorts by birth time. A cohort is rendered as one buffer,
// so elements inside it fuse; separate cohorts layer by age.
export class Scene {
  constructor() {
    this.clear();
  }

  clear() {
    this.cohorts = [];
    this.current = { front: null, back: null };
    this.count = 0;
    this.nextId = 1;
  }

  cohortFor(track, now, windowSec) {
    let c = this.current[track];
    if (!c || now - c.start >= windowSec) {
      c = { id: this.nextId++, track, start: now, end: now, elements: [], version: 0, renderState: null };
      this.cohorts.push(c);
      this.current[track] = c;
    }
    return c;
  }

  add(el, track, now, windowSec) {
    const c = this.cohortFor(track, now, windowSec);
    el.cohort = c;
    c.elements.push(el);
    c.version++;
    c.end = Math.max(c.end, el.born + el.growDuration);
    this.count++;
    return c;
  }

  touch(cohort) {
    cohort.version++;
  }

  isGrowing(cohort, now) {
    return now < cohort.end;
  }

  cull(now, lifetime) {
    const removed = [];
    const kept = [];
    for (const c of this.cohorts) (now - c.start > lifetime ? removed : kept).push(c);
    if (!removed.length) return removed;
    this.cohorts = kept;
    for (const c of removed) {
      this.count -= c.elements.length;
      c.renderState = null;
      if (this.current[c.track] === c) this.current[c.track] = null;
    }
    return removed;
  }
}

export class DensityGrid {
  constructor(cell = 48) {
    this.cell = cell;
    this.cells = new Map();
  }
  key(x, y) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }
  count(x, y) {
    return this.cells.get(this.key(x, y)) || 0;
  }
  add(x, y) {
    const k = this.key(x, y);
    this.cells.set(k, (this.cells.get(k) || 0) + 1);
    return k;
  }
  remove(k) {
    const v = (this.cells.get(k) || 0) - 1;
    if (v > 0) this.cells.set(k, v);
    else this.cells.delete(k);
  }
  clear() {
    this.cells.clear();
  }
}

export function cohortAlpha(age, lifetime, fadeStart) {
  const t = age / lifetime;
  if (t <= fadeStart) return 1;
  if (t >= 1) return 0;
  const u = (t - fadeStart) / (1 - fadeStart);
  return 1 - u * u * (3 - 2 * u);
}

export function ageStep(age, lifetime, steps) {
  return Math.min(steps, Math.max(0, Math.floor((age / lifetime) * steps)));
}
