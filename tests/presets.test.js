import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA, GROUPS, PRESETS, presetValues, sanitize } from '../prototype/src/presets.js';

test('schema entries are well formed', () => {
  const keys = new Set();
  for (const d of SCHEMA) {
    assert.ok(!keys.has(d.key), `duplicate ${d.key}`);
    keys.add(d.key);
    assert.ok(GROUPS.includes(d.group), `${d.key} has unknown group ${d.group}`);
    assert.equal(typeof d.live, 'boolean');
    if (d.type === 'range') assert.ok(d.min < d.max && d.step > 0, d.key);
    if (d.type === 'select') assert.ok(Array.isArray(d.options) && d.options.length > 0, d.key);
  }
});

test('every preset defines every schema parameter within range and nothing else', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    for (const d of SCHEMA) {
      const v = preset[d.key];
      assert.notEqual(v, undefined, `${name}.${d.key} missing`);
      if (d.type === 'range') assert.ok(v >= d.min && v <= d.max, `${name}.${d.key}=${v} out of range`);
      if (d.type === 'select') assert.ok(d.options.includes(v), `${name}.${d.key}=${v}`);
      if (d.type === 'color') assert.match(v, /^#[0-9a-f]{6}$/i);
    }
    assert.deepEqual(Object.keys(preset).sort(), SCHEMA.map((d) => d.key).sort(), `${name} key mismatch`);
  }
});

test('presetValues returns an independent copy', () => {
  const a = presetValues('ribbon');
  a.spineWidth = 999;
  assert.notEqual(PRESETS.ribbon.spineWidth, 999);
});

test('sanitize clamps ranges and rejects invalid values', () => {
  const range = SCHEMA.find((d) => d.key === 'spineWidth');
  assert.equal(sanitize(range, 1e9), range.max);
  assert.equal(sanitize(range, '12'), 12);
  assert.equal(sanitize(range, 'abc'), null);
  const select = SCHEMA.find((d) => d.key === 'fillMode');
  assert.equal(sanitize(select, 'cut'), 'cut');
  assert.equal(sanitize(select, 'nope'), null);
  const color = SCHEMA.find((d) => d.key === 'ink');
  assert.equal(sanitize(color, '#aabbcc'), '#aabbcc');
  assert.equal(sanitize(color, 'red'), null);
});
