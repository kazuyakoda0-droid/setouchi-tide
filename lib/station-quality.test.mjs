import test from 'node:test';
import assert from 'node:assert/strict';
import { stationMarkerClass, stationMarkerLabel, stationQuality } from './station-quality.mjs';

test('公式観測点は●として扱う', () => {
  const st = { jmaAnchor: false };
  assert.equal(stationQuality(st), 'official');
  assert.equal(stationMarkerClass(st), 'off');
  assert.equal(stationMarkerLabel(st), '● 基準点（公式観測点）');
});

test('25km以内の近似地点は○として扱う', () => {
  const st = { jmaAnchor: true, jmaKm: 12 };
  assert.equal(stationQuality(st), 'approx');
  assert.equal(stationMarkerClass(st), 'apx');
  assert.equal(stationMarkerLabel(st), '○ 精度確認済み近似地点');
});

test('遠距離または明示的な低精度地点は△として扱う', () => {
  assert.equal(stationQuality({ jmaAnchor: true, jmaKm: 26 }), 'low');
  assert.equal(stationMarkerClass({ jmaAnchor: true, approxQuality: 'low', jmaKm: 4 }), 'low');
  assert.equal(stationMarkerLabel({ jmaAnchor: true, jmaKm: 30 }), '△ 参考地点');
});
