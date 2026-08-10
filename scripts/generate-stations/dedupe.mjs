import { haversineKm } from './geo.mjs';

// existingPoints, candidates: { lat, lon, ... } の配列
// thresholdKm 未満で重なる候補は「既存に含まれる／候補同士で重複」として除外する。
// 候補は配列の先頭から順に判定するため、先に現れた候補が優先的に残る。
export function mergeCandidates(existingPoints, candidates, thresholdKm) {
  const kept = [];
  const excluded = [];

  for (const c of candidates) {
    const nearExisting = existingPoints.some(e => haversineKm(e, c) < thresholdKm);
    if (nearExisting) {
      excluded.push({ candidate: c, reason: 'existing' });
      continue;
    }
    const nearKept = kept.some(k => haversineKm(k, c) < thresholdKm);
    if (nearKept) {
      excluded.push({ candidate: c, reason: 'duplicate' });
      continue;
    }
    kept.push(c);
  }

  return { kept, excluded };
}
