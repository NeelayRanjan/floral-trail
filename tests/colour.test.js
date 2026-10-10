import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixHex } from '../prototype/src/colour.js';

test('mixHex interpolates and clamps', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#102030', '#ffffff', 0), '#102030');
  assert.equal(mixHex('#102030', '#ffffff', 2), '#ffffff');
  assert.equal(mixHex('#fff', '#000', 1), '#000000');
});
