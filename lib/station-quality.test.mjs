import test from 'node:test';
import assert from 'node:assert/strict';
import { isCoastSupplement, stationLabel, stationMarkerClass, stationMarkerLabel, stationQuality } from './station-quality.mjs';
import { COASTAL_LABELS } from './coastal-labels.mjs';
import { JMA_STN_NAME, TIDE_STATIONS } from './stations.mjs';

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

test('沿岸補完番号は利用者向けの地点名に表示しない', () => {
  const st = { name: '北海道沿岸（補完001）' };
  assert.equal(isCoastSupplement(st), true);
  assert.equal(stationLabel(st), '北海道沿岸');
});

test('全ての沿岸補完地点に国土地理院照合済みの地名がある', () => {
  const supplemental = TIDE_STATIONS.filter(isCoastSupplement);
  assert.equal(Object.keys(COASTAL_LABELS).length, supplemental.length);
  for (const st of supplemental) {
    assert.ok(COASTAL_LABELS[st.id]);
    assert.doesNotMatch(stationLabel(st), /沿岸（補完\d+）/);
  }
});

test('公式観測点の地点名は気象庁の潮位表コードと一致する', () => {
  for (const st of TIDE_STATIONS.filter(st => !st.jmaAnchor)) {
    assert.equal(st.name, JMA_STN_NAME[st.jma], st.id);
  }
});
