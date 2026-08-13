// 地点マークの意味を全ページ・地図・APIで統一する。
// ●: 気象庁の基準となる公式観測点
// ○: 25km以内の公式値を参照し、既存の安全判定を通った近似地点
// △: 参照点まで遠い、または広域海域のため精度保証の対象外となる参考地点

export const ACCURATE_APPROX_MAX_KM = 25;

export function stationQuality(st) {
  if (!st.jmaAnchor) return 'official';
  if (st.approxQuality === 'low' || st.jmaKm > ACCURATE_APPROX_MAX_KM) return 'low';
  return 'approx';
}

export function stationMarkerClass(st) {
  const quality = stationQuality(st);
  return quality === 'official' ? 'off' : quality === 'approx' ? 'apx' : 'low';
}

export function stationMarkerLabel(st) {
  const quality = stationQuality(st);
  if (quality === 'official') return '● 基準点（公式観測点）';
  if (quality === 'approx') return '○ 精度確認済み近似地点';
  return '△ 参考地点';
}
