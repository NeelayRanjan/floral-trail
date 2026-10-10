# Floral Cursor Trail — Design

**Date:** 2026-10-10
**Status:** Approved design, feasibility prototype (not production)

## Goal

Prove that a hero-page background effect can grow hand-drawn-looking floral ornament in the wake of the
mouse cursor, then let it fade away, in a way that reads as the same art style as the reference drawings
in the repo root. A previous attempt that generated the pattern purely mathematically looked artificial.

### What "artificial" meant (from the user)

All four of these were missing and the design must address each:

| Gap | Addressed by |
|---|---|
| Line character (uniform, mechanical lines) | Hollow variable-width ribbons, tapering, two-band wobble (§4.1) |
| Structural richness (sparse, regular) | Loop-back tendrils that cross parents, fused outlines, focal clusters (§3, §4.2) |
| Visual layering (flat) | Age-cohort depth layers that recede; optional back tone (§4.3) |
| Decorative variety (repetitive) | Hand-drawn motif library + weighted terminal palette (§3, §5) |

### Observations about the reference style

- Strokes are **hollow ribbons**: a closed outline around a band of varying width, tapering to points.
- **Overlapping ribbons fuse** — outlines merge at crossings, producing knot-like density.
- **No blunt ends** — every free end terminates in a curl, hook, bud, frill, or flower.
- **Offshoots loop back and cross** their parent rather than branching away tree-like.
- Edges **wobble** (ink roughness) and leaves have **ragged, deckled** edges.

### Decisions made

- One engine with **switchable presets**: `ribbon` (calligraphic, refs `2214…`, `63ed…`, `2315…`),
  `nouveau` (art-nouveau frills and blooms, refs `0ad6…`, `01a1…`, `fd13…`), `botanical` (thin stems,
  puffy flowers, ref `3a0d…`).
- **Behaviour:** a continuous vine trails the cursor like a wake; tendrils and blooms sprout behind it;
  oldest growth fades first.
- **Approach:** procedural skeleton (spine, tendrils, curls) + hand-drawn motif stamps (blooms, frills,
  buds) extracted from artwork. Rejected: warping artwork along the path (distortion, joint problems) and
  pure stamp collage (repetitive, doesn't grow).
- **Format:** standalone `prototype/` — `index.html` + vanilla ES modules, Canvas 2D, no build step.
- Reference images are used for extraction during feasibility only; the user will supply their own art
  before anything ships. Copyright is out of scope for this phase.
- Repo is local/private; no remote.

## 1. Architecture

```
pointer events
   │
   ▼
PathSampler ── smooths + resamples the raw mouse path at fixed arc-length spacing
   │
   ▼
Grower ──────── extends the spine; decides when/where to spawn tendrils, terminals, frills, blooms
   │
   ▼
Scene ───────── Elements, each with birth time, depth cohort, grow → hold → fade lifecycle; culls dead, caps count
   │
   ▼
Renderer ────── per cohort: outline pass → cut pass (fused outlines) → ink-detail pass; composites cohorts by age
```

### Element kinds

- **Ribbon** — centreline polyline + width profile + wobble seed. Spine pieces, tendrils, procedural curls.
  Grows in by revealing arc length `0 → L`.
- **Motif** — hand-drawn stamp: `silhouette` path (for the fuse trick) + `ink` path (interior detail),
  placed with position / rotation / scale. Blooms, frills, buds. Grows in by scaling/unfurling from its
  anchor.

### Presets

Plain objects holding every tunable: ribbon widths, wobble amplitudes, meander, tendril spacing and
loop-back probability, curl tightness, terminal weights, motif selection and frequency, fill mode, cohort
window, lifetime, blur, back-tone fraction, density limit. Three to start: `ribbon`, `nouveau`, `botanical`.

### Tuning panel

Preset dropdown, sliders for key parameters, FPS readout, and an **auto-draw** toggle that drives a
synthetic cursor along a looping, seeded path (for repeatable screenshots, performance checks, and
judging the look hands-free).

## 2. File layout

```
prototype/
  index.html
  src/
    main.js       loop, wiring, resize/DPR, reduced-motion
    input.js      PathSampler, auto-draw synthetic cursor
    grower.js     spawn rules (pure)
    scene.js      elements, cohorts, lifecycle, density grid (pure)
    geometry.js   resampling, normals, ribbon outline, spirals (pure)
    noise.js      1D value/simplex noise
    rng.js        seeded RNG
    presets.js    preset definitions
    render.js     Canvas 2D drawing, cohort buffers
    panel.js      tuning UI
  assets/motifs.json
tools/
  extract_motifs.py
  motif_regions.json
tests/
  *.test.js       node --test, no dependencies
```

`geometry.js`, `grower.js`, `scene.js`, `noise.js`, `rng.js` must not touch the DOM or canvas so they are
testable in Node.

## 3. Growth rules

All randomness comes from a **seeded RNG**; a given seed + input path yields the same composition.

### Spine

- **Grows, doesn't draw:** the tip chases the sampled cursor path at a capped growth speed; a fast flick
  becomes a sweep that keeps growing briefly after the mouse stops.
- **Meander:** a low-frequency lateral offset is added perpendicular to the path so straight mouse
  movements become S-curves.
- **Width profile:** base width with gentle noise swell/pinch, tapered tail, pointed growing tip.
- **Strands:** the spine is broken into overlapping strands of ~600–1200 px (preset). When a strand
  reaches its length it ends in a terminal and a new strand begins slightly offset, overlapping it.

### Tendrils

- Spawn every *n* px along the spine (with jitter), usually alternating sides.
- Depart **tangent-continuous** at 20–45° from the spine.
- Curvature increases along arc length (clothoid-like), so each tendril relaxes into a spiral. The
  curvature growth rate is the "curl tightness" parameter (lazy arc ↔ tight scroll).
- **Loop-back:** with probability *p* the tendril curves back toward its parent with enough total turning
  to **cross** it; the renderer fuses the crossing.
- **Sub-tendrils:** at most one extra level, smaller scale.

### Terminals

Every free end gets one, chosen from the preset's weighted palette: procedural spiral curl (ending in a
small ball), hook, teardrop blob, or a motif (bud / leaf / flower).

### Frills

Ragged-leaf motifs attached on the **outer** side of ribbons at local curvature maxima, scaled to the
local ribbon width.

### Blooms / focal clusters

Rare. Spawn probability rises as cursor speed falls, so lingering creates focal points. A bloom spawns
with 2–3 short curling tendrils around it.

### Density control

A spatial grid rejects spawns in cells above a preset density limit, so scribbling over one spot thickens
growth without saturating it.

### Preset character

| Preset | Spine | Tendrils | Terminals | Motifs |
|---|---|---|---|---|
| `ribbon` | wide, strong meander | high loop-back | mostly spiral curls | few |
| `nouveau` | wide | medium loop-back | mixed | many frills, occasional blooms |
| `botanical` | thin stems | arching, gravity droop, no loop-back | mostly flower motifs | flowers |

## 4. Rendering

### 4.1 Ribbon geometry and line character

- Centreline resampled at ~3 px; each side offset by `w(s)/2` along the normal to form a closed outline.
- End styles: pointed taper, or round blob for ball-curl terminals.
- **Wobble:** each side receives independent 1D noise at two bands — low-frequency (pen pressure) and
  high-frequency small-amplitude (ink roughness). Independent sides mean width breathes slightly.

### 4.2 Fused outlines (transparent output)

Per cohort, on an offscreen transparent canvas:

1. **Outline pass:** stroke every silhouette in ink colour.
2. **Cut pass:** fill every silhouette with `globalCompositeOperation = 'destination-out'`, erasing
   interiors. Only the outer boundary of the union survives, so overlaps fuse.
3. **Ink pass:** draw motif interior details.

Because strokes are centred on the path, the cut pass erases the inner half: the outline pass uses
`lineWidth = 2 × inkWeight` so the visible line equals the preset's `inkWeight`.

Optional preset fill mode: fill interiors with a solid colour instead of cutting (white-on-paper look of
`fd13…`).

Result is transparent outside the linework, so the effect composites over any hero background.

### 4.3 Depth: age cohorts

- Elements born within one cohort window (~0.75 s, preset) share an offscreen buffer. Elements within a
  cohort fuse; separate cohorts overlap with newer on top — this is the foreground/background effect.
- Each frame, cohorts composite oldest-first. With age a cohort loses opacity, its ink shifts toward a
  lighter tint, and it optionally blurs (0–1.5 px). Lifetime ~6–10 s (preset); fully faded cohorts and
  their elements are removed.
- **Freezing:** a cohort buffer is re-rendered only while any of its elements are still growing; afterwards
  it is frozen and only re-composited. At most ~1–2 cohorts re-render per frame.
- **Spine seams:** the spine is chunked across cohorts as it grows. Interior chunk boundaries outline only
  the side edges, never the cut ends, so adjacent chunks join seamlessly and the fade travels down the tail.
- **Back tone:** optionally a preset fraction of elements is born into a lighter "back" tone so fresh
  growth already shows two depths.

### 4.4 Housekeeping

DPR-aware canvas sizing, resize handling, `prefers-reduced-motion` → render a static composition instead
of animating, global element cap.

## 5. Motif pipeline

`tools/extract_motifs.py` (Python, PIL + numpy, shelling out to `potrace`; ImageMagick available if needed).

- **Manifest** `tools/motif_regions.json`: per motif — source PNG, crop box, type (`bloom` / `frill` /
  `bud` / `leaf`), anchor point and attach direction (crop coords), preset tags. Initial crops chosen from
  the references: puffy flowers (`3a0d…`), bloom and bud (`fd13…`), frilly leaves (`0ad6…`, `01a1…`).
- **Process:**
  1. Crop → greyscale → threshold (robust to `fd13…`'s paper texture) → small morphological close to
     seal 1 px gaps.
  2. **Silhouette** = flood-fill from the crop border; unreachable non-ink pixels plus ink = silhouette.
  3. **Interior ink** = ink ∩ (silhouette eroded by stroke width).
  4. Trace both with `potrace` → SVG path `d` strings; normalise so anchor = origin, attach direction =
     +x, unit scale.
- **Output** `prototype/assets/motifs.json`: `[{ id, type, presets, silhouette, ink, size }]`, consumed via
  `Path2D`.
- **Known limitation:** motifs cut from a stem have an open end at the crop edge; the renderer hides it by
  overlapping the attaching ribbon end onto the motif base. Some manual crop tuning is expected; the
  pipeline is the reusable asset, not the specific crops. The user's own art will go through the same
  pipeline later.

## 6. Testing and verification

- **Unit tests** (`node --test`): path resampling, ribbon outline offsetting, spiral/curl generator,
  cohort lifecycle (grow → freeze → fade → cull), density grid rejection, seeded determinism.
- **Visual checks:** auto-draw with a fixed seed, screenshots via Playwright at fixed timestamps for each
  preset; shared with the user for review.
- **Performance target:** sustained 60 fps at 1440p during 60 s of auto-draw with the element cap active.

### Success criteria

1. The `ribbon` preset is recognisably in the style of the references.
2. Growth is smooth with no visible seams.
3. Presets produce visibly different characters.
4. The user, viewing it live, judges the concept feasible. Visual tuning after first viewing is expected.

## Out of scope

Framework integration (React/Next), production build, mobile/touch behaviour, copyright clearance of
reference art, final colour palette.
