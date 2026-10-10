import { SCHEMA, GROUPS, PRESETS } from './presets.js';

function h(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined) n.append(c);
  return n;
}

const decimals = (step) => (String(step).includes('.') ? String(step).split('.')[1].length : 0);

// Builds the top bar from the parameter schema, so every tunable gets a control automatically.
export function createPanel(root, { params, state, on }) {
  const inputs = [];
  const fps = h('span', { class: 'fps' }, '-- fps');

  const presetSel = h('select', { title: 'Preset', onchange: () => on.preset(presetSel.value) },
    ...Object.keys(PRESETS).map((n) => h('option', { value: n }, n)));
  const seedIn = h('input', { type: 'number', class: 'seed', title: 'Seed', value: String(state.seed) });
  const auto = h('input', { type: 'checkbox', onchange: () => on.autoDraw(auto.checked) });
  auto.checked = state.autoDraw;

  const groups = h('div', { class: 'groups' });
  for (const group of GROUPS) {
    const body = h('div', { class: 'controls' });
    for (const def of SCHEMA.filter((d) => d.group === group)) body.append(control(def));
    const det = h('details', {}, h('summary', {}, group), body);
    det.addEventListener('toggle', () => {
      if (!det.open) return;
      for (const other of groups.querySelectorAll('details')) if (other !== det) other.open = false;
    });
    groups.append(det);
  }

  const bar = h('div', { class: 'bar' },
    h('button', { class: 'collapse', title: 'Collapse panel', onclick: () => root.classList.toggle('collapsed') }, '☰'),
    h('label', {}, 'Preset ', presetSel),
    h('button', { onclick: () => on.preset(presetSel.value) }, 'Reset to preset'),
    h('label', {}, 'Seed ', seedIn),
    h('button', { onclick: () => on.seed(Number(seedIn.value) || 1) }, 'Re-seed'),
    h('button', { onclick: () => on.clear() }, 'Clear canvas'),
    h('label', {}, auto, ' Auto-draw'),
    h('button', { onclick: copySettings }, 'Copy settings'),
    h('button', { onclick: pasteSettings }, 'Paste settings'),
    fps,
    groups,
  );
  root.replaceChildren(bar);

  function control(def) {
    let input;
    if (def.type === 'range') input = h('input', { type: 'range', min: def.min, max: def.max, step: def.step });
    else if (def.type === 'color') input = h('input', { type: 'color' });
    else input = h('select', {}, ...def.options.map((o) => h('option', { value: o }, o)));
    const out = h('output', {});
    input.addEventListener('input', () => {
      const v = def.type === 'range' ? Number(input.value) : input.value;
      params[def.key] = v;
      show(def, input, out);
      on.param(def.key, v, def.live);
    });
    inputs.push({ def, input, out });
    const tag = def.live ? null : h('span', { class: 'tag', title: 'Affects new growth only' }, 'new');
    return h('label', { class: 'control' }, h('span', { class: 'name' }, def.label, tag), input, out);
  }

  function show(def, input, out) {
    out.textContent = def.type === 'range' ? Number(input.value).toFixed(decimals(def.step)) : input.value;
  }

  function refresh() {
    presetSel.value = state.presetName;
    for (const { def, input, out } of inputs) {
      input.value = String(params[def.key]);
      show(def, input, out);
    }
  }

  async function copySettings() {
    const json = JSON.stringify(params, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      fps.textContent = 'copied';
    } catch {
      window.prompt('Copy settings:', json);
    }
  }

  async function pasteSettings() {
    let text = null;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = window.prompt('Paste settings JSON:');
    }
    if (!text) return;
    try {
      on.load(JSON.parse(text));
    } catch {
      fps.textContent = 'invalid JSON';
    }
  }

  refresh();
  return {
    refresh,
    setFps: (n) => { fps.textContent = `${Math.round(n)} fps`; },
  };
}
