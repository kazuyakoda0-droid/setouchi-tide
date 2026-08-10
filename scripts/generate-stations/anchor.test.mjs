import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestOfficialStation, assignAnchor } from './anchor.mjs';

const STATIONS = [
  { jma: 'AA', lat: 34.0, lon: 133.0 },
  { jma: 'BB', lat: 35.0, lon: 135.0 },
];

test('nearestOfficialStation: 一番近い観測点を返す', () => {
  const candidate = { lat: 34.1, lon: 133.1 };
  assert.equal(nearestOfficialStation(candidate, STATIONS).jma, 'AA');
});

test('nearestOfficialStation: 観測点が無ければnull', () => {
  assert.equal(nearestOfficialStation({ lat: 0, lon: 0 }, []), null);
});

test('assignAnchor: 既存の近似地点と同じ規約のオブジェクトを返す', () => {
  const candidate = { lat: 34.1, lon: 133.1 };
  assert.deepEqual(assignAnchor(candidate, STATIONS), {
    jma: 'AA', jmaAnchor: true, damp: 1.00, dz: 0, dphase: 0.00, model: null,
  });
});

test('assignAnchor: 観測点が無ければnull', () => {
  assert.equal(assignAnchor({ lat: 0, lon: 0 }, []), null);
});
