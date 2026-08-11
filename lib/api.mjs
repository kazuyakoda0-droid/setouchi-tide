// =====================================================================
// 簡易版の潮汐API（静的JSON）
//
// クエリパラメータは受け付けない。ビルド時に config.mjs の DAYS_BACK〜
// DAYS_FWD ぶんをまとめて1地点1ファイルに書き出す。今日だけ10分毎の
// 系列(levels)も含める。他の日まで含めると容量が膨らむため、満干潮・
// 潮名・日月の出入りだけにしている。
//
//   GET /api/{pref}/{station}.json
// =====================================================================

import { fmtHM } from './util.mjs';

function extremesJSON(extremes) {
  return extremes.map(e => ({
    type: e.type === '満潮' ? 'high' : 'low',
    time: fmtHM(e.time),
    levelCm: Math.round(e.level),
  }));
}

// days: [{ ymd, cel, day, isToday }]
//   cel  = lib/astro.mjs の celestialData() の戻り値
//   day  = lib/tide.mjs の tideDay() の戻り値（データが無い日は null）
export function stationApiJSON(st, days) {
  return {
    id: st.id,
    name: st.name,
    pref: st.pref,
    lat: st.lat,
    lon: st.lon,
    official: !st.jmaAnchor,
    jmaStation: st.jmaName || st.jma,
    jmaDistanceKm: st.jmaKm != null ? Math.round(st.jmaKm) : null,
    generatedAt: new Date().toISOString(),
    days: days.map(d => ({
      date: d.ymd,
      shio: d.cel.shio,
      moonAge: Math.round(d.cel.age * 10) / 10,
      sunrise: fmtHM(d.cel.sunrise),
      sunset: fmtHM(d.cel.sunset),
      extremes: d.day ? extremesJSON(d.day.extremes) : [],
      rangeCm: d.day ? d.day.range : null,
      levels10min: d.isToday && d.day ? d.day.levels : undefined,
    })),
  };
}
