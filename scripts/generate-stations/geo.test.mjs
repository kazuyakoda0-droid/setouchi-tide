import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, pointInGeometry } from './geo.mjs';

test('haversineKm: 東京-大阪は約400km', () => {
  const tokyo = { lat: 35.6812, lon: 139.7671 };
  const osaka = { lat: 34.6937, lon: 135.5023 };
  const d = haversineKm(tokyo, osaka);
  assert.ok(d > 390 && d < 410, `expected ~400km, got ${d}`);
});

test('haversineKm: 同一点は0km', () => {
  const p = { lat: 35.0, lon: 135.0 };
  assert.equal(haversineKm(p, p), 0);
});

test('pointInGeometry: 単純な四角形(Polygon)の内側', () => {
  const square = {
    type: 'Polygon',
    coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]],
  };
  assert.equal(pointInGeometry(5, 5, square), true);
});

test('pointInGeometry: 単純な四角形(Polygon)の外側', () => {
  const square = {
    type: 'Polygon',
    coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]],
  };
  assert.equal(pointInGeometry(15, 15, square), false);
});

test('pointInGeometry: 穴あきPolygonの穴の中はfalse', () => {
  const withHole = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]],
      [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]],
    ],
  };
  assert.equal(pointInGeometry(5, 5, withHole), false);
  assert.equal(pointInGeometry(1, 1, withHole), true);
});

test('pointInGeometry: MultiPolygonはどちらかの島に入っていればtrue', () => {
  const twoIslands = {
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]],
      [[[10, 10], [10, 12], [12, 12], [12, 10], [10, 10]]],
    ],
  };
  assert.equal(pointInGeometry(11, 11, twoIslands), true);
  assert.equal(pointInGeometry(5, 5, twoIslands), false);
});
