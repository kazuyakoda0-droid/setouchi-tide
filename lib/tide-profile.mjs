// =====================================================================
// 地域の潮汐プロファイル
//
// 都道府県・地方の解説文を書くための実測値。気象庁の年次潮位表は
// ビルドで既に全部読み込んであるので、そこから集計するだけで済む。
//
// 解説を人手のテンプレ文だけで埋めるとどの県も同じ文章になるが、
// ここで出す数値は地域ごとに必ず違う。文章はこの数値に従って組み立てる。
// =====================================================================

// 1観測点の年間統計。干満差はその日の満潮の最高と干潮の最低の差。
// 極値が片方しか無い日(日周潮の日)は毎時値の最大-最小で代用する。
function stationProfile(byDay) {
  const ranges = [];
  let diurnal = 0, days = 0;
  for (const k of Object.keys(byDay)) {
    const d = byDay[k];
    if (!d || !d.hourly) continue;
    const ex = d.extremes || [];
    const hi = ex.filter(e => e.type === '満潮');
    const lo = ex.filter(e => e.type === '干潮');
    ranges.push(hi.length && lo.length
      ? Math.max(...hi.map(e => e.level)) - Math.min(...lo.map(e => e.level))
      : Math.max(...d.hourly) - Math.min(...d.hourly));
    if (hi.length <= 1) diurnal++;
    days++;
  }
  if (!days) return null;
  const sorted = [...ranges].sort((a, b) => a - b);
  const mean = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  const tenth = Math.max(1, Math.round(sorted.length * 0.1));
  return {
    avg: mean(ranges),
    max: sorted[sorted.length - 1],
    // 大潮・小潮のころの目安。年間の上位1割・下位1割の平均を使う。
    spring: mean(sorted.slice(-tenth)),
    neap: mean(sorted.slice(0, tenth)),
    diurnalPct: Math.round(diurnal / days * 100),
  };
}

import { stationLabel } from './station-quality.mjs';

// stations: その地域の観測点。jma: build.mjs が読み込んだ潮位表。
export function areaProfile(stations, jma) {
  const rows = [];
  for (const st of stations) {
    const byDay = jma[st.jma];
    if (!byDay) continue;
    const p = stationProfile(byDay);
    if (p) rows.push({ st, ...p });
  }
  if (!rows.length) return null;
  const mean = f => Math.round(rows.reduce((a, r) => a + f(r), 0) / rows.length);
  const top = rows.reduce((a, b) => (a.max > b.max ? a : b));
  const bottom = rows.reduce((a, b) => (a.max < b.max ? a : b));
  return {
    n: rows.length,
    avg: mean(r => r.avg),
    spring: mean(r => r.spring),
    neap: mean(r => r.neap),
    diurnalPct: mean(r => r.diurnalPct),
    max: top.max, maxStation: stationLabel(top.st),
    min: bottom.max, minStation: stationLabel(bottom.st),
  };
}
