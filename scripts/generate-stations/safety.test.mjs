import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averageTidalRangeCm, tidalRangeVarianceExceeds, isRedundant } from './safety.mjs';

test('averageTidalRangeCm: 2日分のhourlyから平均干満差を計算する', () => {
  const yearData = {
    '2026-01-01': { hourly: [100, 150, 200, 150, 100, 50, ...Array(18).fill(100)] }, // range150
    '2026-01-02': { hourly: [100, 120, 140, 120, 100, 80, ...Array(18).fill(100)] }, // range60
  };
  assert.equal(averageTidalRangeCm(yearData), (150 + 60) / 2);
});

test('averageTidalRangeCm: 欠測(null)ばかりの日は無視する', () => {
  const yearData = {
    '2026-01-01': { hourly: Array(24).fill(null) },
    '2026-01-02': { hourly: [100, 200, ...Array(22).fill(100)] }, // range100
  };
  assert.equal(averageTidalRangeCm(yearData), 100);
});

test('averageTidalRangeCm: 全日欠測ならnull', () => {
  const yearData = { '2026-01-01': { hourly: Array(24).fill(null) } };
  assert.equal(averageTidalRangeCm(yearData), null);
});

test('tidalRangeVarianceExceeds: 近隣観測点の干満差が大きくばらつく場合はtrue', () => {
  const candidate = { lat: 34.0, lon: 133.0 };
  const officialStations = [
    { jma: 'AA', lat: 34.05, lon: 133.05, avgRangeCm: 300 },
    { jma: 'BB', lat: 33.95, lon: 132.95, avgRangeCm: 100 },
  ];
  assert.equal(tidalRangeVarianceExceeds(candidate, officialStations), true);
});

test('tidalRangeVarianceExceeds: ばらつきが小さければfalse', () => {
  const candidate = { lat: 34.0, lon: 133.0 };
  const officialStations = [
    { jma: 'AA', lat: 34.05, lon: 133.05, avgRangeCm: 200 },
    { jma: 'BB', lat: 33.95, lon: 132.95, avgRangeCm: 210 },
  ];
  assert.equal(tidalRangeVarianceExceeds(candidate, officialStations), false);
});

test('tidalRangeVarianceExceeds: 半径内の公式観測点が1件以下なら判定不能でfalse', () => {
  const candidate = { lat: 34.0, lon: 133.0 };
  const officialStations = [{ jma: 'AA', lat: 34.05, lon: 133.05, avgRangeCm: 300 }];
  assert.equal(tidalRangeVarianceExceeds(candidate, officialStations), false);
});

test('isRedundant: 3km未満に既存地点があればtrue', () => {
  const candidate = { lat: 35.0, lon: 135.0 };
  assert.equal(isRedundant(candidate, [{ lat: 35.01, lon: 135.01 }]), true);
});

test('isRedundant: 3km以上離れていればfalse', () => {
  const candidate = { lat: 35.0, lon: 135.0 };
  assert.equal(isRedundant(candidate, [{ lat: 35.1, lon: 135.1 }]), false);
});
