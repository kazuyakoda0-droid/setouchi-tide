import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignIds } from './ids.mjs';

test('assignIds: 既存IDと衝突しないID列を発番する', () => {
  assert.deepEqual(assignIds(['jma_aa', 'p001'], 3), ['n0001', 'n0002', 'n0003']);
});

test('assignIds: 既存にn0001があればスキップする', () => {
  assert.deepEqual(assignIds(['n0001'], 2), ['n0002', 'n0003']);
});

test('assignIds: 発番したIDに重複が無い', () => {
  const ids = assignIds([], 100);
  assert.equal(new Set(ids).size, 100);
});
