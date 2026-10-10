import { createRng } from './rng.js';
import { Scene, DensityGrid } from './scene.js';
import { Grower } from './grower.js';
import { PathSampler, Smoother, autoDrawPosition, clampDt } from './input.js';
import { Renderer } from './render.js';
import { PRESETS, SCHEMA, presetValues, sanitize } from './presets.js';
import { loadMotifs } from './motifs.js';
import { createPanel } from './panel.js';

const FIXED_DT = 1 / 60;
const query = new URLSearchParams(location.search);
const state = {
  presetName: query.get('preset') in PRESETS ? query.get('preset') : 'ribbon',
  seed: Number(query.get('seed')) || 1,
  autoDraw: query.get('autodraw') === '1',
  fixedStep: query.get('fixedstep') === '1',
};

const params = presetValues(state.presetName);
const motifs = await loadMotifs('assets/motifs.json');
const scene = new Scene();
const grid = new DensityGrid(48);
const grower = new Grower({ scene, grid, params, rng: createRng(state.seed), motifs });
const sampler = new PathSampler(3, 220);
const smoother = new Smoother();
const renderer = new Renderer(document.getElementById('stage'), { scene, params, motifs });

let pointer = null;
let simTime = 0;
let autoTime = 0;
let staticMode = false;

function lift() {
  pointer = null;
  sampler.breakStrand();
  smoother.reset();
}
window.addEventListener('pointermove', (e) => {
  if (e.target instanceof Element && e.target.closest('#panel')) {
    if (pointer) lift();
    return;
  }
  pointer = { x: e.clientX, y: e.clientY };
});
document.documentElement.addEventListener('pointerleave', lift);
window.addEventListener('blur', lift);

function applyPaper() {
  document.body.style.background = params.paper;
}
function resize() {
  renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  if (staticMode) renderer.render(simTime);
}
window.addEventListener('resize', resize);

function clearAll() {
  scene.clear();
  grid.clear();
  grower.reset();
  sampler.breakStrand();
  smoother.reset();
}

function step(dt) {
  simTime += dt;
  let target = pointer;
  if (state.autoDraw) {
    autoTime += dt;
    target = autoDrawPosition(autoTime, renderer.w, renderer.h, state.seed);
  }
  if (target) {
    const p = smoother.update(target, dt, params.smoothing);
    sampler.push(p.x, p.y);
  }
  grower.feed(sampler.take());
  grower.update(dt, simTime, target ? smoother.speed : Infinity);
  for (const c of scene.cull(simTime, params.lifetime)) {
    for (const el of c.elements) if (el.cellKey) grid.remove(el.cellKey);
  }
}

// In static mode (reduced motion / ?pause=1) there is no frame loop, so actions repaint themselves.
function repaint() {
  if (staticMode) renderer.render(simTime);
}

const actions = {
  param(key, value, live) {
    if (live) renderer.invalidate();
    if (key === 'paper') applyPaper();
    repaint();
  },
  preset(name) {
    state.presetName = name;
    Object.assign(params, presetValues(name));
    renderer.invalidate();
    applyPaper();
    panel.refresh();
    repaint();
  },
  seed(seed) {
    state.seed = seed;
    grower.setRng(createRng(seed));
  },
  clear() {
    clearAll();
    repaint();
  },
  autoDraw(on) {
    state.autoDraw = on;
    if (!on) {
      sampler.breakStrand();
      smoother.reset();
    }
  },
  load(obj) {
    for (const def of SCHEMA) {
      if (!(def.key in obj)) continue;
      const v = sanitize(def, obj[def.key]);
      if (v !== null) params[def.key] = v;
    }
    renderer.invalidate();
    applyPaper();
    panel.refresh();
    repaint();
  },
};

const panel = createPanel(document.getElementById('panel'), { params, state, on: actions });

window.__floral = { state, params, scene, renderer, step, actions, fps: 0, get simTime() { return simTime; } };

resize();
applyPaper();
const warmup = Number(query.get('warmup')) || 0;
for (let i = 0; i < Math.round(warmup / FIXED_DT); i++) step(FIXED_DT);

// ?motion=1 plays the animation even when the OS asks for reduced motion.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches && query.get('motion') !== '1';
if (reducedMotion && !warmup) {
  const wasAuto = state.autoDraw;
  state.autoDraw = true;
  for (let i = 0; i < 300; i++) step(FIXED_DT);
  state.autoDraw = wasAuto;
}

if (reducedMotion || query.get('pause') === '1') {
  staticMode = true;
  if (reducedMotion) {
    document.querySelector('.hero p').textContent = 'animation paused (reduced motion) — add ?motion=1 to the URL to play';
  }
  renderer.render(simTime);
} else {
  let last = performance.now();
  let fps = 60;
  let frames = 0;
  const frame = (t) => {
    const raw = (t - last) / 1000;
    last = t;
    step(state.fixedStep ? FIXED_DT : clampDt(raw));
    renderer.render(simTime);
    if (raw > 0) fps += (1 / raw - fps) * 0.05;
    window.__floral.fps = fps;
    if (++frames % 15 === 0) panel.setFps(fps);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
