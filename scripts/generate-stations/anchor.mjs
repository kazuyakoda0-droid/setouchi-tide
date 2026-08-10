import { haversineKm } from './geo.mjs';

// officialStations: [{ jma, lat, lon }, ...]（jmaAnchor:false の地点）
export function nearestOfficialStation(candidate, officialStations) {
  let best = null, bestDist = Infinity;
  for (const s of officialStations) {
    const d = haversineKm(candidate, s);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

// 既存の近似地点(jmaAnchor:true)と同じ規約で damp/dz/dphase/model を確定する。
// 広島湾の検証済み7地点のような特別な係数は、今回の生成対象には含めない
// (対象は新規地点のみで、検証データが存在しないため)。
export function assignAnchor(candidate, officialStations) {
  const nearest = nearestOfficialStation(candidate, officialStations);
  if (!nearest) return null;
  return {
    jma: nearest.jma,
    jmaAnchor: true,
    damp: 1.00,
    dz: 0,
    dphase: 0.00,
    model: null,
  };
}
