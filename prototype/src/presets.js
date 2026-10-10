// Every tunable lives here. live: true => applies to existing growth immediately (renderer);
// live: false => affects only growth spawned after the change (grower/input).

export const GROUPS = ['Spine', 'Tendrils', 'Terminals', 'Motifs', 'Line & Wobble', 'Depth & Fade', 'Colours'];

const range = (key, label, group, min, max, step, live = false) => ({ key, label, group, type: 'range', min, max, step, live });
const select = (key, label, group, options, live = false) => ({ key, label, group, type: 'select', options, live });
const color = (key, label) => ({ key, label, group: 'Colours', type: 'color', live: true });

export const SCHEMA = [
  range('growSpeed', 'Grow speed (px/s)', 'Spine', 100, 3000, 10),
  range('smoothing', 'Path smoothing (ms)', 'Spine', 0, 400, 5),
  range('meanderAmp', 'Meander amount (px)', 'Spine', 0, 150, 1),
  range('meanderWavelength', 'Meander wavelength (px)', 'Spine', 80, 1500, 10),
  range('strandMin', 'Strand length min (px)', 'Spine', 150, 4000, 10),
  range('strandMax', 'Strand length max (px)', 'Spine', 150, 4000, 10),
  range('spineWidth', 'Spine width (px)', 'Spine', 1, 60, 0.5, true),
  range('widthNoise', 'Swell / pinch', 'Spine', 0, 1, 0.01, true),
  range('tailTaper', 'Tail taper (px)', 'Spine', 0, 400, 5, true),
  range('tipTaper', 'Tip taper (px)', 'Spine', 0, 300, 5, true),

  range('tendrilSpacing', 'Spacing (px)', 'Tendrils', 20, 600, 5),
  range('tendrilChance', 'Spawn chance', 'Tendrils', 0, 1, 0.01),
  range('alternateSides', 'Alternate sides', 'Tendrils', 0, 1, 0.01),
  range('departMin', 'Departure angle min (°)', 'Tendrils', 0, 90, 1),
  range('departMax', 'Departure angle max (°)', 'Tendrils', 0, 90, 1),
  range('lengthMin', 'Length min (px)', 'Tendrils', 20, 900, 5),
  range('lengthMax', 'Length max (px)', 'Tendrils', 20, 900, 5),
  range('tendrilWidth', 'Width (× spine)', 'Tendrils', 0.1, 1.5, 0.01, true),
  range('tendrilEndWidth', 'End width (× start)', 'Tendrils', 0, 1, 0.01, true),
  range('bodyBend', 'Body bend (rad)', 'Tendrils', 0, 4, 0.05),
  range('curlRadius', 'Curl radius (px)', 'Tendrils', 2, 80, 0.5),
  range('curlRamp', 'Curl ramp', 'Tendrils', 1, 8, 0.1),
  range('loopBackChance', 'Loop-back chance', 'Tendrils', 0, 1, 0.01),
  range('outwardCurlChance', 'Outward curl chance', 'Tendrils', 0, 1, 0.01),
  range('subTendrilChance', 'Sub-tendril chance', 'Tendrils', 0, 1, 0.01),
  range('droop', 'Droop (gravity)', 'Tendrils', 0, 4, 0.05),
  range('growTime', 'Grow time (s)', 'Tendrils', 0.1, 4, 0.05),

  range('wCurl', 'Curl weight', 'Terminals', 0, 10, 0.1),
  range('wBall', 'Ball weight', 'Terminals', 0, 10, 0.1),
  range('wHook', 'Hook weight', 'Terminals', 0, 10, 0.1),
  range('wBud', 'Bud weight', 'Terminals', 0, 10, 0.1),
  range('wLeaf', 'Leaf weight', 'Terminals', 0, 10, 0.1),
  range('wFlower', 'Flower weight', 'Terminals', 0, 10, 0.1),
  range('ballSize', 'Ball size (× tendril width)', 'Terminals', 0.2, 3, 0.05, true),

  select('motifSet', 'Motif set', 'Motifs', ['ribbon', 'nouveau', 'botanical']),
  range('motifScale', 'Motif scale', 'Motifs', 0.1, 4, 0.05, true),
  range('frillChance', 'Frill chance', 'Motifs', 0, 1, 0.01),
  range('frillSpacing', 'Frill spacing (px)', 'Motifs', 10, 300, 5),
  range('bloomRate', 'Bloom rate (/s when slow)', 'Motifs', 0, 5, 0.05),
  range('slowSpeed', 'Slow speed (px/s)', 'Motifs', 10, 1000, 10),
  range('clusterTendrils', 'Cluster tendrils', 'Motifs', 0, 6, 1),
  range('densityLimit', 'Density limit (per cell)', 'Motifs', 1, 40, 1),
  range('maxElements', 'Max elements', 'Motifs', 100, 6000, 50),

  range('inkWeight', 'Ink weight (px)', 'Line & Wobble', 0.3, 6, 0.1, true),
  range('wobbleLow', 'Wobble (px)', 'Line & Wobble', 0, 10, 0.1, true),
  range('wobbleLowWave', 'Wobble wavelength (px)', 'Line & Wobble', 10, 600, 5, true),
  range('roughness', 'Roughness (px)', 'Line & Wobble', 0, 3, 0.05, true),
  range('roughnessWave', 'Roughness wavelength (px)', 'Line & Wobble', 1, 40, 0.5, true),
  select('fillMode', 'Interior', 'Line & Wobble', ['cut', 'fill'], true),

  range('cohortWindow', 'Layer window (s)', 'Depth & Fade', 0.1, 3, 0.05),
  range('lifetime', 'Lifetime (s)', 'Depth & Fade', 1, 30, 0.5, true),
  range('fadeStart', 'Fade starts at (× lifetime)', 'Depth & Fade', 0, 0.95, 0.01, true),
  range('ageTint', 'Age tint', 'Depth & Fade', 0, 1, 0.01, true),
  range('blurMax', 'Age blur (px)', 'Depth & Fade', 0, 4, 0.1, true),
  range('backChance', 'Back-tone chance', 'Depth & Fade', 0, 1, 0.01),
  range('backMix', 'Back-tone lightness', 'Depth & Fade', 0, 1, 0.01, true),

  color('ink', 'Ink'),
  color('paper', 'Paper (background)'),
  color('fill', 'Interior fill'),
];

const ribbon = {
  growSpeed: 900, smoothing: 120, meanderAmp: 40, meanderWavelength: 520, strandMin: 700, strandMax: 1300,
  spineWidth: 24, widthNoise: 0.4, tailTaper: 180, tipTaper: 90,
  tendrilSpacing: 120, tendrilChance: 0.85, alternateSides: 0.75, departMin: 20, departMax: 45,
  lengthMin: 120, lengthMax: 320, tendrilWidth: 0.6, tendrilEndWidth: 0.3, bodyBend: 0.6,
  curlRadius: 16, curlRamp: 3, loopBackChance: 0.45, outwardCurlChance: 0.4, subTendrilChance: 0.35,
  droop: 0, growTime: 0.9,
  wCurl: 6, wBall: 4, wHook: 1.5, wBud: 0, wLeaf: 0, wFlower: 0, ballSize: 1.3,
  motifSet: 'ribbon', motifScale: 1, frillChance: 0, frillSpacing: 60, bloomRate: 0, slowSpeed: 120,
  clusterTendrils: 3, densityLimit: 10, maxElements: 2500,
  inkWeight: 1.6, wobbleLow: 0.8, wobbleLowWave: 140, roughness: 0.15, roughnessWave: 6, fillMode: 'cut',
  cohortWindow: 0.75, lifetime: 9, fadeStart: 0.45, ageTint: 0.5, blurMax: 0.8, backChance: 0.15, backMix: 0.55,
  ink: '#1d1a17', paper: '#f6f1e8', fill: '#ffffff',
};

const nouveau = {
  ...ribbon,
  meanderAmp: 55, spineWidth: 22, widthNoise: 0.55, tendrilSpacing: 120, loopBackChance: 0.3,
  wCurl: 4, wBall: 2, wHook: 2, wBud: 2, wLeaf: 3, wFlower: 1,
  motifSet: 'nouveau', motifScale: 1.8, frillChance: 0.35, frillSpacing: 45, bloomRate: 0.8,
  inkWeight: 1.6, wobbleLow: 1.4, roughness: 0.5, fillMode: 'fill',
  ink: '#151311', paper: '#e9e6df', fill: '#ffffff',
};

const botanical = {
  ...ribbon,
  meanderAmp: 30, spineWidth: 4.5, widthNoise: 0.1, tailTaper: 40, tipTaper: 20,
  tendrilSpacing: 90, tendrilChance: 0.9, departMin: 30, departMax: 70, lengthMin: 80, lengthMax: 260,
  tendrilWidth: 0.8, tendrilEndWidth: 0.7, bodyBend: 0.3, curlRadius: 30, loopBackChance: 0,
  outwardCurlChance: 0.5, subTendrilChance: 0.3, droop: 1.6,
  wCurl: 0.5, wBall: 0, wHook: 0, wBud: 0, wLeaf: 0, wFlower: 7,
  motifSet: 'botanical', motifScale: 1.7, bloomRate: 0.6,
  inkWeight: 1.3, wobbleLow: 0.3, roughness: 0.05,
};

export const PRESETS = { ribbon, nouveau, botanical };

export function presetValues(name) {
  return { ...(PRESETS[name] ?? PRESETS.ribbon) };
}

// Validates a pasted value against its schema entry: clamps ranges, returns null if unusable.
export function sanitize(def, value) {
  if (def.type === 'range') {
    const n = Number(value);
    if (value === '' || value === null || !Number.isFinite(n)) return null;
    return Math.min(def.max, Math.max(def.min, n));
  }
  if (def.type === 'select') return def.options.includes(value) ? value : null;
  if (def.type === 'color') return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  return null;
}
