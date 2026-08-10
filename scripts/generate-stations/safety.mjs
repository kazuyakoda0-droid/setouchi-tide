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
