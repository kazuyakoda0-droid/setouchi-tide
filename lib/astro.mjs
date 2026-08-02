// =====================================================================
// 天文計算（太陽・月・月齢・潮名）
//
// 元の astro.js からの変更点は2つ。
//
//  1. celestialData(st, offset) → celestialData(st, dayMs)
//     ビルド時は「今日から何日後」ではなく任意の暦日を指定する必要がある。
//
//  2. 調和定数モデル(HC_HIROSHIMA)を持ち込んでいない。
//     静的生成では気象庁の年次ファイルから全地点・全日の実データが得られるので、
//     通信失敗時のフォールバックという概念自体が存在しない。
//     広島湾専用モデルを他海域に流用する事故の余地をなくす意味もある。
// =====================================================================

import { D2R, mod24 } from './util.mjs';

const EPOCH = Date.UTC(2000, 0, 1);
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const SYN = 29.530588853;   // 朔望月(日)

// 月齢(1〜30) → 潮名
const SHIO = {
  1: '大潮', 2: '大潮', 3: '中潮', 4: '中潮', 5: '中潮', 6: '中潮',
  7: '小潮', 8: '小潮', 9: '小潮', 10: '長潮', 11: '若潮', 12: '中潮',
  13: '中潮', 14: '大潮', 15: '大潮', 16: '大潮', 17: '大潮', 18: '中潮',
  19: '中潮', 20: '中潮', 21: '中潮', 22: '小潮', 23: '小潮', 24: '小潮',
  25: '長潮', 26: '若潮', 27: '中潮', 28: '中潮', 29: '大潮', 30: '大潮',
};

// 指定した暦日(JSTの0:00をUTCミリ秒で表したもの)の太陽・月・潮名を返す。
// 緯度経度のみに依存するため全地点で使える。潮位は一切含まない。
export function celestialData(st, dayMs) {
  const d = new Date(dayMs);
  const Y = d.getUTCFullYear(), Mo = d.getUTCMonth(), Da = d.getUTCDate(), wd = d.getUTCDay();
  const jstMidUTC = dayMs - 9 * 3600000;
  const noonUTC = jstMidUTC + 12 * 3600000;

  let age = ((noonUTC - NEW_MOON) / 86400000) % SYN;
  if (age < 0) age += SYN;
  const lunarDay = Math.min(30, Math.max(1, Math.floor(age) + 1));

  // 太陽の出入り(近似式)
  const N = Math.round((Date.UTC(Y, Mo, Da) - Date.UTC(Y, 0, 0)) / 86400000);
  const decl = 23.44 * D2R * Math.sin(2 * Math.PI * (N - 81) / 365);
  const latR = st.lat * D2R;
  let cosH = -Math.tan(latR) * Math.tan(decl);
  cosH = Math.max(-1, Math.min(1, cosH));
  const H = Math.acos(cosH) * 180 / Math.PI;
  const B = 2 * Math.PI * (N - 81) / 364;
  const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const noon = 12 - (st.lon - 135) / 15 - EoT / 60;
  const sunrise = noon - H / 15, sunset = noon + H / 15;

  // 月の出入り(月齢からの近似)
  const moonrise = mod24(sunrise + (age / SYN) * 24);
  const moonset = mod24(moonrise + 12.42);
  const moonculm = mod24((moonrise + moonset) / 2 + (moonset < moonrise ? 12 : 0));

  return {
    Y, Mo, Da, wd, dayMs,
    age, lunarDay, shio: SHIO[lunarDay],
    illum: (1 - Math.cos(2 * Math.PI * age / SYN)) / 2,
    sunrise, sunset, daylen: sunset - sunrise,
    moonrise, moonset, moonculm,
    epochHours: (jstMidUTC - EPOCH) / 3600000,
  };
}

// 月の満ち欠けを描く SVG パス
export function moonPath(cx, cy, r, phase) {
  const m = Math.cos(2 * Math.PI * phase);
  const f = (1 - m) / 2;
  const waxing = phase < 0.5;
  const sweepLimb = waxing ? 1 : 0;
  const rx = Math.abs(m) * r;
  const termSweep = (f < 0.5) ? sweepLimb : (1 - sweepLimb);
  return 'M ' + cx + ' ' + (cy - r) + ' A ' + r + ' ' + r + ' 0 0 ' + sweepLimb
    + ' ' + cx + ' ' + (cy + r) + ' A ' + rx.toFixed(2) + ' ' + r + ' 0 0 '
    + termSweep + ' ' + cx + ' ' + (cy - r) + ' Z';
}

export function phaseName(age) {
  if (age < 1.85) return '新月';
  if (age < 5.5) return '三日月';
  if (age < 9.2) return '上弦の月';
  if (age < 12.9) return '十三夜月';
  if (age < 16.6) return '満月';
  if (age < 20.3) return '居待月';
  if (age < 24.0) return '下弦の月';
  if (age < 27.7) return '有明月';
  return '新月前';
}
