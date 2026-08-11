import { haversineKm } from './geo.mjs';

// yearData: lib/jma.mjs の parseYear()/loadYears() が返す
// { 'YYYY-MM-DD': { hourly:[24個, null混在] } }
// 1日ごとの (最大-最小) を求め、有効な日だけで平均した「平均干満差(cm)」を返す。
export function averageTidalRangeCm(yearData) {
  const ranges = [];
  for (const day of Object.values(yearData)) {
    const vals = day.hourly.filter(v => v != null);
    if (vals.length < 2) continue;
    ranges.push(Math.max(...vals) - Math.min(...vals));
  }
  if (ranges.length === 0) return null;
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

// officialStations: [{ jma, lat, lon, avgRangeCm }, ...]
// 半径radiusKm以内にある公式観測点の平均干満差の (最大-最小)/平均 が
// thresholdRatio を超えるとき、その候補は「潮汐境界」上にあるとみなす。
// 半径内の公式観測点が1件以下の場合は判定不能なので false（除外しない）。
export function tidalRangeVarianceExceeds(candidate, officialStations, { radiusKm = 25, thresholdRatio = 0.25 } = {}) {
  const nearby = officialStations.filter(s => haversineKm(candidate, s) <= radiusKm && s.avgRangeCm != null);
  if (nearby.length < 2) return false;

  const ranges = nearby.map(s => s.avgRangeCm);
  const max = Math.max(...ranges), min = Math.min(...ranges);
  const mean = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  if (mean === 0) return false;
  return (max - min) / mean > thresholdRatio;
}

// stations: 既存の TIDE_STATIONS（公式観測点・近似地点どちらも含む）
// radiusKm 未満に既存地点があれば冗長とみなす。
export function isRedundant(candidate, stations, radiusKm = 3) {
  return stations.some(s => haversineKm(candidate, s) < radiusKm);
}

// officialStations: [{ jma, lat, lon }, ...]
// 最寄りの公式観測点までの距離が maxKm を超える候補は除外する。
// OSMの amenity=ferry_terminal / leisure=fishing タグは、川や渓谷の遊覧船・
// 渡し船など海に接しない地点も拾ってしまう。tidalRangeVarianceExceeds は
// 周囲25km以内に公式観測点が2件以上ないと判定できないため、そうした
// 内陸の誤検出をすり抜けてしまう。この関数はその最後の砦として、
// 「近くに参照できる実測地点が無いなら値を作らない」という既存の
// 方針（根拠のない係数を与えない）をそのまま距離の面に適用する。
export function isTooFarFromAnchor(candidate, officialStations, maxKm = 25) {
  return officialStations.every(s => haversineKm(candidate, s) > maxKm);
}

// OSMの leisure=fishing タグは「海釣り桟橋」のような潮汐地点と、
// 「管理釣り場」と呼ばれる人工の淡水釣り堀（ヘラブナ・ニジマス等）を
// 区別せず拾ってしまう。後者は海から離れていても近隣に公式観測点が
// 複数あれば isTooFarFromAnchor をすり抜けるため(例: 神戸市街地に近い
// 六甲山中の釣り堀)、名称から判定できるものは別途除外する。
// 「海釣り」「釣り桟橋」「漁港」等の実在の海関連語には一致しない。
const FRESHWATER_POND_PATTERN = /釣堀|釣り堀|釣池|ます池|鱒池|へら鮒|管理釣り?場/;

export function isFreshwaterFishingPond(candidate) {
  return FRESHWATER_POND_PATTERN.test(candidate.name);
}
