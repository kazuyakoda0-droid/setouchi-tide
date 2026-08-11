import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averageTidalRangeCm, tidalRangeVarianceExceeds, isRedundant, isTooFarFromAnchor, isKnownNonTidalPlace } from './safety.mjs';

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

test('isTooFarFromAnchor: 全観測点がmaxKmより遠ければtrue(除外対象)', () => {
  const candidate = { lat: 35.0, lon: 135.0 };
  const officialStations = [{ jma: 'AA', lat: 36.0, lon: 136.0 }]; // 約140km
  assert.equal(isTooFarFromAnchor(candidate, officialStations, 25), true);
});

test('isTooFarFromAnchor: maxKm以内に1件でもあればfalse', () => {
  const candidate = { lat: 35.0, lon: 135.0 };
  const officialStations = [
    { jma: 'AA', lat: 36.0, lon: 136.0 },   // 遠い
    { jma: 'BB', lat: 35.05, lon: 135.05 }, // 近い
  ];
  assert.equal(isTooFarFromAnchor(candidate, officialStations, 25), false);
});

test('isKnownNonTidalPlace: 「釣堀」「釣り堀」「釣池」「ます池」「へら鮒」を含む名称はtrue', () => {
  assert.equal(isKnownNonTidalPlace({ name: '等々力釣池' }), true);
  assert.equal(isKnownNonTidalPlace({ name: '釣り堀' }), true);
  assert.equal(isKnownNonTidalPlace({ name: '旭市長熊釣堀センター' }), true);
  assert.equal(isKnownNonTidalPlace({ name: '有馬ます池' }), true);
  assert.equal(isKnownNonTidalPlace({ name: '寒川へら鮒釣り場' }), true);
});

test('isKnownNonTidalPlace: 2026-08-12に発見した内陸施設の名称パターンもtrue', () => {
  // 実際に本番データに混入していた10件のうち、名称から判定できたもの
  assert.equal(isKnownNonTidalPlace({ name: '千秋公園大手門の堀遊歩道' }), true); // 城跡の堀(秋田市街)
  assert.equal(isKnownNonTidalPlace({ name: 'わんぱく広場遊歩道' }), true); // 倶知安町(山間部)
  assert.equal(isKnownNonTidalPlace({ name: '林道 箕浦堀切線' }), true); // 観音寺市の林道(山中)
  assert.equal(isKnownNonTidalPlace({ name: 'AKAIGAWA TOMO PLAYPARK' }), true); // 赤井川村(スキー場の村)
  assert.equal(isKnownNonTidalPlace({ name: '東京ドイツ村ボート乗り場' }), true); // 園内の人工池
  assert.equal(isKnownNonTidalPlace({ name: '保谷フィッシングセンター' }), true); // 西東京市(内陸)
  assert.equal(isKnownNonTidalPlace({ name: 'つりぼり金ちゃん' }), true); // 江戸川区の淡水釣り堀(ひらがな表記)
});

test('isKnownNonTidalPlace: 海沿いのフィッシングパークはfalse(フィッシングセンターのみ除外対象)', () => {
  // 賢島フィッシングパーク 海遊苑(三重県志摩市、標高1m)は志摩湾に面した
  // 実在の海釣り施設。フィッシングという語だけで一律除外すると
  // こうした正規の地点まで消してしまうため、パターンは限定的にしてある。
  assert.equal(isKnownNonTidalPlace({ name: '賢島フィッシングパーク 海遊苑' }), false);
});

test('isKnownNonTidalPlace: 海釣り施設や漁港・桟橋の名称はfalse', () => {
  assert.equal(isKnownNonTidalPlace({ name: '若洲海浜公園 海釣施設' }), false);
  assert.equal(isKnownNonTidalPlace({ name: '大黒海づり施設' }), false);
  assert.equal(isKnownNonTidalPlace({ name: '豊浜港釣り桟橋' }), false);
  assert.equal(isKnownNonTidalPlace({ name: '釣師浜漁港' }), false);
});
