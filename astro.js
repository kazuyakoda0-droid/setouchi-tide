// =====================================================================
// 天文計算 と 調和定数による潮位モデル
//
// このファイルは2つの独立した役割を持つ。混同しないこと。
//
//   1. celestialData()  — 太陽・月・月齢・潮名。緯度経度のみに依存するため
//                          全51地点で正しく使える。
//   2. 調和定数モデル    — 広島(宇品)の公式調和定数による潮位推算。
//                          広島湾専用であり、他海域に流用してはいけない。
//                          st.model === 'hiroshima' の地点でのみ、
//                          気象庁データが取れなかったときの代替として使う。
//
// なぜ分離するか:
//   干満差は瀬戸内が約370cm、日本海側の境が約42cmと9倍近い開きがある。
//   広島のモデルを日本海側に当てると桁違いに外れた曲線を描いてしまうため、
//   「太陽と月は全地点で計算してよい / 潮位は広島湾だけ」と境界を明示する。
//
// util.js より後に読み込むこと。
// =====================================================================

const EPOCH = Date.UTC(2000, 0, 1, 0, 0, 0, 0);
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0, 0);
const SYN = 29.530588853;   // 朔望月(日)

// 月齢(1〜30)→潮名
const SHIO = {
  1: '大潮', 2: '大潮', 3: '中潮', 4: '中潮', 5: '中潮', 6: '中潮',
  7: '小潮', 8: '小潮', 9: '小潮', 10: '長潮', 11: '若潮', 12: '中潮',
  13: '中潮', 14: '大潮', 15: '大潮', 16: '大潮', 17: '大潮', 18: '中潮',
  19: '中潮', 20: '中潮', 21: '中潮', 22: '小潮', 23: '小潮', 24: '小潮',
  25: '長潮', 26: '若潮', 27: '中潮', 28: '中潮', 29: '大潮', 30: '大潮',
};

// ---------------------------------------------------------------------
// 1. 天文計算（全地点で有効）
// ---------------------------------------------------------------------

// 指定日の 太陽・月・月齢・潮名 を返す。潮位は一切含まない。
function celestialData(st, offset) {
  const dayMs = todayJSTMs() + offset * 86400000;
  const d = new Date(dayMs);
  const Y = d.getUTCFullYear(), Mo = d.getUTCMonth(), Da = d.getUTCDate(), wd = d.getUTCDay();
  const jstMidUTC = dayMs - 9 * 3600000;
  const t0 = (jstMidUTC - EPOCH) / 3600000;   // EPOCH からの経過時間(時)
  const noonUTC = jstMidUTC + 12 * 3600000;

  let age = ((noonUTC - NEW_MOON) / 86400000) % SYN;
  if (age < 0) age += SYN;
  const lunarDay = Math.min(30, Math.max(1, Math.floor(age) + 1));
  const shio = SHIO[lunarDay];

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

  return { Y, Mo, Da, wd, age, shio, sunrise, sunset, moonrise, moonset, moonculm, t0, N, dayMs };
}

function moonPath(cx, cy, r, phase) {
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

function phaseName(age) {
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

// ---------------------------------------------------------------------
// 2. 調和定数モデル（広島湾専用 — st.model === 'hiroshima' のみ）
// ---------------------------------------------------------------------

// 海上保安庁 公式調和定数 広島(宇品) s=0118 (H=振幅cm, kappa=遅角°)
// 8主要分潮は公式値をそのまま使用。V0(平衡潮引数)は 2000-01-01 00:00 UTC、
// JST標準子午線(135°E)基準: 半日周潮 V0=V0_greenwich+2*135、日周潮 V0=V0_greenwich+1*135
//   s0=211.728°(月経度), h0=279.974°(太陽経度), p0=83.297°(月近地点)
const _h0 = 279.974, _s0 = 211.728, _p0 = 83.297;
const M2 = [28.9841042, 101.53, 278.08, mod360(2 * _h0 - 2 * _s0) + 270];
const S2 = [30.0000000, 42.08, 307.98, mod360(0) + 270];
const K1 = [15.0410686, 30.88, 216.89, mod360(_h0 + 90) + 135];
const O1 = [13.9430356, 22.55, 194.60, mod360(-_h0 + 2 * _s0 + 270) + 135];
const N2 = [28.4397295, 18.10, 268.57, mod360(2 * _h0 - 3 * _s0 + _p0) + 270];
const K2 = [30.0821373, 12.03, 304.31, mod360(2 * _h0 + 180) + 270];
const P1 = [14.9589314, 9.35, 217.49, mod360(-_h0 + 270) + 135];
const L2 = [29.5284789, 4.12, 291.47, mod360(2 * _h0 - _s0 + _p0) + 270];
// 長周期分潮(species0、135°補正なし)
const Sa = [0.0410686, 16.47, 149.20, mod360(_h0)];
const Ssa = [0.0821373, 1.95, 32.99, mod360(2 * _h0)];
// Mm(s-p)は自身は加えないが、Q1/λ2の"衛星"導出に使う中間値
const _MmSigma = M2[0] - N2[0], _MmV0 = mod360(_s0 - _p0);
// 角速度一致で検証済みの安全な追加分潮(衛星関係・浅海複合波のみ採用。
// 符号規約が未検証な分潮(M1,J1,OO1,ν2,μ2等)は誤差混入リスクがあるため見送り)
const Q1 = [O1[0] - _MmSigma, 4.44, 183.05, mod360(O1[3] - _MmV0)];
const N2x2 = [2 * N2[0] - M2[0], 2.28, 260.53, mod360(2 * N2[3] - M2[3])];
const LAM2 = [S2[0] - _MmSigma, 1.77, 292.36, mod360(S2[3] - _MmV0)];
const T2 = [S2[0] - Sa[0], 2.46, 301.91, mod360(2 * _h0 - 282.94) + 270];

const HC_HIROSHIMA = {
  M2, S2, K1, O1, N2, K2, P1, L2, Sa, Ssa, Q1, '2N2': N2x2, LAM2, T2,
  // 浅海(複合)分潮: 主要分潮の和・差で厳密に導出(符号規約リスクなし)
  '2SM2': [2 * S2[0] - M2[0], 1.17, 168.67, mod360(2 * S2[3] - M2[3])],
  MO3: [M2[0] + O1[0], 0.47, 152.26, mod360(M2[3] + O1[3])],
  SO3: [S2[0] + O1[0], 0.20, 220.30, mod360(S2[3] + O1[3])],
  MK3: [M2[0] + K1[0], 0.23, 175.31, mod360(M2[3] + K1[3])],
  SK3: [S2[0] + K1[0], 0.30, 227.32, mod360(S2[3] + K1[3])],
  M3: [1.5 * M2[0], 0.46, 355.81, mod360(1.5 * M2[3])],
  MN4: [M2[0] + N2[0], 0.53, 22.33, mod360(M2[3] + N2[3])],
  M4: [2 * M2[0], 1.49, 34.24, mod360(2 * M2[3])],
  SN4: [S2[0] + N2[0], 0.18, 58.45, mod360(S2[3] + N2[3])],
  MS4: [M2[0] + S2[0], 1.45, 65.62, mod360(M2[3] + S2[3])],
  MK4: [M2[0] + K2[0], 0.67, 44.51, mod360(M2[3] + K2[3])],
  S4: [2 * S2[0], 0.21, 86.27, mod360(2 * S2[3])],
  SK4: [S2[0] + K2[0], 0.16, 133.50, mod360(S2[3] + K2[3])],
  '2MN6': [2 * M2[0] + N2[0], 1.50, 134.78, mod360(2 * M2[3] + N2[3])],
  M6: [3 * M2[0], 3.05, 143.10, mod360(3 * M2[3])],
  MSN6: [M2[0] + S2[0] + N2[0], 0.81, 181.61, mod360(M2[3] + S2[3] + N2[3])],
  '2MS6': [2 * M2[0] + S2[0], 4.00, 176.02, mod360(2 * M2[3] + S2[3])],
  '2MK6': [2 * M2[0] + K2[0], 1.18, 169.82, mod360(2 * M2[3] + K2[3])],
  '2SM6': [2 * S2[0] + M2[0], 1.07, 222.81, mod360(2 * S2[3] + M2[3])],
  MSK6: [M2[0] + S2[0] + K2[0], 0.77, 208.71, mod360(M2[3] + S2[3] + K2[3])],
};

// 月の昇交点黄経 N(度)。18.6年周期の交点補正(f=振幅係数, u=位相補正)に使用。
function nodalN(t) {
  const d = t / 24 - 0.5;   // days since J2000.0 (2000-01-01 12:00 UTC)
  return mod360(125.0445 - 0.0529539 * d);
}

function baseFU(group, Nr) {
  switch (group) {
    case 'M2': return { f: 1 - 0.037 * Math.cos(Nr), u: -2.1 * Math.sin(Nr) };
    case 'K2': return { f: 1.024 + 0.286 * Math.cos(Nr), u: -17.7 * Math.sin(Nr) };
    case 'K1': return { f: 1.006 + 0.115 * Math.cos(Nr), u: -8.9 * Math.sin(Nr) };
    case 'O1': return { f: 1.009 + 0.187 * Math.cos(Nr), u: 10.8 * Math.sin(Nr) };
    default: return { f: 1, u: 0 };
  }
}

// 分潮名→交点補正グループ。satelliteは親分潮と同じ補正を流用。
// compoundは構成分潮の f を掛け合わせ u を合算。
const NODAL_GROUP = {
  M2: 'M2', N2: 'M2', L2: 'M2', '2N2': 'M2', LAM2: 'M2',
  K2: 'K2', K1: 'K1', O1: 'O1', Q1: 'O1',
};
const COMPOUND_PARTS = {
  '2SM2': ['S2', 'S2', 'M2'], MO3: ['M2', 'O1'], SO3: ['S2', 'O1'],
  MK3: ['M2', 'K1'], SK3: ['S2', 'K1'], M3: ['M2'], MN4: ['M2', 'N2'],
  M4: ['M2', 'M2'], SN4: ['S2', 'N2'], MS4: ['M2', 'S2'], MK4: ['M2', 'K2'],
  S4: ['S2', 'S2'], SK4: ['S2', 'K2'], '2MN6': ['M2', 'M2', 'N2'],
  M6: ['M2', 'M2', 'M2'], MSN6: ['M2', 'S2', 'N2'], '2MS6': ['M2', 'M2', 'S2'],
  '2MK6': ['M2', 'M2', 'K2'], '2SM6': ['S2', 'S2', 'M2'], MSK6: ['M2', 'S2', 'K2'],
};

function nodalFU(name, Ndeg) {
  const Nr = Ndeg * D2R;
  if (NODAL_GROUP[name]) return baseFU(NODAL_GROUP[name], Nr);
  if (COMPOUND_PARTS[name]) {
    let f = 1, u = 0;
    for (const part of COMPOUND_PARTS[name]) {
      const g = NODAL_GROUP[part]
        || (part === 'K2' ? 'K2' : part === 'K1' ? 'K1' : part === 'O1' ? 'O1' : null);
      const r = baseFU(g, Nr);
      f *= r.f; u += r.u;
    }
    return { f, u };
  }
  return { f: 1, u: 0 };   // S2/P1/Sa/Ssa/T2 は交点補正なし
}

// t: EPOCH からの経過時間(時)
function height(t, st) {
  const tt = t - st.dphase;
  const N = nodalN(t);
  let h = 200 + st.dz;
  for (const name in HC_HIROSHIMA) {
    const c = HC_HIROSHIMA[name];
    const fu = nodalFU(name, N);
    h += c[1] * fu.f * st.damp * Math.cos((c[0] * tt + c[3] + fu.u - c[2]) * D2R);
  }
  return h;
}

function height10min(st, t0) {
  const a = [];
  for (let i = 0; i < 144; i++) a.push(Math.round(height(t0 + i / 6, st)));
  return a;
}

// 10分刻みで見つけた極値の近傍を三分探索で分単位まで精密化
function refineExtreme(st, t0, guessH, isHigh) {
  let lo = t0 + guessH - 1 / 6, hi = t0 + guessH + 1 / 6;
  for (let iter = 0; iter < 60; iter++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const v1 = height(m1, st), v2 = height(m2, st);
    if (isHigh ? v1 < v2 : v1 > v2) lo = m1; else hi = m2;
  }
  const t = (lo + hi) / 2;
  return { time: t - t0, level: height(t, st) };
}

// 極値を 10分データ配列から検出（平坦部分も正しく扱う）
function extremesFrom10min(levels10min) {
  const ex = [];
  const n = levels10min.length;
  let i = 1;
  while (i < n - 1) {
    const prev = levels10min[i - 1], cur = levels10min[i];
    if (cur > prev) {
      let j = i;
      while (j < n - 1 && levels10min[j + 1] === cur) j++;
      if (levels10min[j + 1] < cur) {
        ex.push({ type: '満潮', time: Math.floor((i + j) / 2) / 6, level: cur });
      }
      i = j + 1;
    } else if (cur < prev) {
      let j = i;
      while (j < n - 1 && levels10min[j + 1] === cur) j++;
      if (levels10min[j + 1] > cur) {
        ex.push({ type: '干潮', time: Math.floor((i + j) / 2) / 6, level: cur });
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return ex;
}

// この地点で調和定数モデルを使ってよいか。
// 広島湾(Q8/Q9)系のみ true。他海域では潮位の桁が違うため使わせない。
function canModelTide(st) { return st.model === 'hiroshima'; }

// モデルによる1日分の潮位。使用可否は必ず canModelTide() で判定してから呼ぶこと。
// 使えない地点で呼ばれた場合は null を返し、呼び出し側に「データなし」を強制する。
function modelTide(st, t0) {
  if (!canModelTide(st)) return null;
  const levels = height10min(st, t0);
  const extremes = extremesFrom10min(levels).map(e => {
    const r = refineExtreme(st, t0, e.time, e.type === '満潮');
    return { type: e.type, time: r.time, level: r.level };
  });
  return { levels, extremes, source: 'model' };
}
