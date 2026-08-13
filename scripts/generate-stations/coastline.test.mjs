import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coastalCandidates } from './coastline.mjs';

test('coastalCandidates: shared prefecture border is excluded, outer coast is sampled', () => {
  const geoJSON = { features: [
    { properties: { P: 'A県' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } },
    { properties: { P: 'B県' }, geometry: { type: 'Polygon', coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]] } },
  ] };
  const points = coastalCandidates(geoJSON, { 'A県': 'a', 'B県': 'b' }, [{ id: 'a', name: 'A県' }, { id: 'b', name: 'B県' }], { spacingKm: 100 });
  assert.equal(points.length, 6);
  assert.ok(points.every(p => p.tag === 'coastline-fallback'));
  assert.ok(points.some(p => p.name === 'A県沿岸（補完001）'));
});
