// =====================================================================
// 潮位偏差（実測 − 推算）
//
// 気象庁「潮位観測情報」(jma.go.jp/bosai/tidelevel/) は、潮位表(suisan)とは
// 別のシステムで、観測点コードも別体系（例: 東京 = suisanでは"TK"、
// こちらは"124431"）、基準面も異なる（東京湾平均水面(TP)基準）。
//
// 実測潮位から suisan の推算値を直接引き算すると基準面の差がそのまま
// 誤差になるため、この偏差は「潮位観測情報システム内の実測 − 同システム内の
// 天文潮位(推算)」だけで計算する。どちらも同じ基準面なので差し引きが成立する。
// suisan側の表示潮位（当サイトの本体データ）とは独立しており、
// 一致させる必要はない。
//
// tide_obs の配列は「当日ぶんだけ」ではなく、末尾が最新観測・そこから
// interval分刻みで遡る長さ不定の履歴になっている（実測で確認: 同じ観測点でも
// 取得した日によって配列長が変わる）。そのため「配列の何番目が0時か」は
// 前提にせず、末尾の非null値=直近の実測とだけみなし、その時刻はビルド実行時の
// 実時刻（wall clock）を使う。安全のため、算出した偏差が明らかに大きすぎる
// (|偏差|>80cm)場合は取得ミスの疑いが強いとみなして採用しない。
// =====================================================================

import { haversineKm } from '../scripts/generate-stations/geo.mjs';

const AREA_URL = 'https://www.jma.go.jp/bosai/tidelevel/const/tide_area.json';
const MAX_PLAUSIBLE_DEVIATION_CM = 80;

function obsUrl(dateKey, code) {
  return `https://www.jma.go.jp/bosai/tidelevel/data/tide/tide_obs_${dateKey.replace(/-/g, '')}_${code}.json`;
}
function astroUrl(year, code) {
  return `https://www.jma.go.jp/bosai/tidelevel/const/tide_astro/tide_astro_${year}_${code}.json`;
}

// tide_area.json は地域階層のツリー構造。stations だけ平らに集める。
export function flattenBosaiStations(areaJson) {
  const out = [];
  for (const areaKey of Object.keys(areaJson)) {
    for (const c30 of areaJson[areaKey].class30s || []) {
      for (const s of c30.stations || []) {
        out.push({ code: s.code, name: s.name, lat: s.lat, lon: s.lon });
      }
    }
  }
  return out;
}

// officialStations: TIDE_STATIONS の jmaAnchor:false ぶん（{ jma, name, lat, lon }）
// 名前が完全一致する候補を優先し、無ければ maxKm 以内で最も近い候補を採用する。
// どちらも無ければそのstationは対応なし(undefined)。
export function matchBosaiStations(officialStations, bosaiStations, maxKm = 3) {
  const map = new Map();
  for (const st of officialStations) {
    const exact = bosaiStations.find(b => b.name === st.name);
    if (exact) { map.set(st.jma, exact.code); continue; }

    let best = null, bestKm = Infinity;
    for (const b of bosaiStations) {
      const d = haversineKm(st, b);
      if (d < bestKm) { bestKm = d; best = b; }
    }
    if (best && bestKm <= maxKm) map.set(st.jma, best.code);
  }
  return map;
}

async function fetchJSON(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'japan-tide-atlas static site builder' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// 年間の天文潮位(推算)。ファイル自体は年内不変なので呼び出し側でキャッシュする。
export async function fetchBosaiAstro(code, year, { fetchImpl = fetch } = {}) {
  const json = await fetchJSON(astroUrl(year, code), fetchImpl);
  return json.tide; // { 'MMDD': [24個, 1時間毎cm] }
}

// 直近の実測潮位(速報値)。末尾からたどって最初に見つかった非null値を返す。
export async function fetchLatestObs(code, dateKey, { fetchImpl = fetch } = {}) {
  const json = await fetchJSON(obsUrl(dateKey, code), fetchImpl);
  const tide = json.tide || [];
  for (let i = tide.length - 1; i >= 0; i--) {
    if (tide[i] != null) return tide[i];
  }
  return null;
}

// astroDay: [24個, 1時間毎cm]（今日のMMDDに対応する1日ぶん）
// nowHour: ビルド実行時点の実時刻（0時からの小数時。lib/util.mjsの
// nowHourJST()相当だが、呼び出し側から渡してテストしやすくしている）
// 1時間毎の推算値を線形補間して同時刻の推算値を出し、実測との差を返す。
// 差が MAX_PLAUSIBLE_DEVIATION_CM を超える場合は取得ミスを疑ってnullにする。
export function computeDeviation(astroDay, obsCm, nowHour) {
  if (!astroDay || obsCm == null) return null;
  const h0 = Math.floor(nowHour) % 24;
  const h1 = (h0 + 1) % 24;
  const frac = nowHour - Math.floor(nowHour);
  const a0 = astroDay[h0], a1 = astroDay[h1];
  if (a0 == null || a1 == null) return null;
  const astroAt = a0 + (a1 - a0) * frac;

  const deviationCm = Math.round(obsCm - astroAt);
  if (Math.abs(deviationCm) > MAX_PLAUSIBLE_DEVIATION_CM) return null;

  const totalMin = Math.round(nowHour * 60);
  return {
    deviationCm, obsCm, astroCm: Math.round(astroAt),
    hh: Math.floor(totalMin / 60) % 24, mm: totalMin % 60,
  };
}

// officialStations ぶんまとめて計算する。1つの観測点の失敗が他を止めないよう、
// 個別にtry/catchで囲んで諦める(天気予報の loadForecast と同じ方針)。
export async function loadDeviations(officialStations, dateKey, nowHour, { fetchImpl = fetch, onProgress } = {}) {
  const areaJson = await fetchJSON(AREA_URL, fetchImpl);
  const bosaiStations = flattenBosaiStations(areaJson);
  const codeByJma = matchBosaiStations(officialStations, bosaiStations);

  const year = dateKey.slice(0, 4);
  const mmdd = dateKey.slice(5, 7) + dateKey.slice(8, 10);
  const astroCache = new Map(); // code -> astroYear
  const deviations = new Map(); // jma -> computeDeviation()の戻り値
  const failed = [];
  let done = 0;

  for (const st of officialStations) {
    const code = codeByJma.get(st.jma);
    if (code) {
      try {
        let astroYear = astroCache.get(code);
        if (!astroYear) {
          astroYear = await fetchBosaiAstro(code, year, { fetchImpl });
          astroCache.set(code, astroYear);
        }
        const obsCm = await fetchLatestObs(code, dateKey, { fetchImpl });
        const dev = computeDeviation(astroYear[mmdd], obsCm, nowHour);
        if (dev) deviations.set(st.jma, dev);
      } catch (e) {
        failed.push(`${st.name}(${e.message})`);
      }
    }
    done++;
    if (onProgress) onProgress(done, officialStations.length);
  }

  return { deviations, matched: codeByJma.size, failed };
}
