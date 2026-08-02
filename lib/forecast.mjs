// =====================================================================
// 気象庁 天気予報の取得（ビルド時）
//
// これまで気象・海象は Open-Meteo をブラウザから叩いていたが、
// 無料 API は非商用に限られており、広告を載せた時点で使えなくなる。
// 潮位と同じ気象庁に一本化し、取得はビルド時に済ませる。
//
//   https://www.jma.go.jp/bosai/forecast/data/forecast/{府県予報区}.json
//
// ビルド時に取りに行く利点:
//   ・閲覧者のブラウザから気象庁へ一切アクセスしない（先方への負荷ゼロ）
//   ・HTML に直接書き出せるので検索エンジンに読まれる
//   ・JavaScript を切っていても表示される／描画のガタつきが無い
// 代わりに、表示されるのはビルド時点（毎日 04:10 JST）の発表になる。
// 発表時刻をページに出しているのはこのため。
//
// 予報の中身:
//   1ブロック目 = 短期予報。今日・明日・明後日の 天気/風/波（一次細分区域）、
//                 6時間ごとの降水確率、アメダス地点の気温。
//   2ブロック目 = 週間予報。明日〜7日先の 天気コード/降水確率/信頼度と、
//                 代表地点の最高最低気温。
// つまり今日〜7日先までが埋まる。過去日は含まれない。
//
// 観測点をどの予報区に結びつけるか:
//   forecast_area.json が「府県予報区 → 一次細分区域 → アメダス地点」を
//   持っているので、アメダス地点に座標を与えて最寄りを選ぶ。
//   候補は同じ都道府県の予報区に限る。県境の港で隣県の予報が出るのを
//   防ぐためで、地理的な最寄りより行政区画の一致を優先している。
// =====================================================================

import { telop } from './telops.mjs';

const FORECAST_AREA = 'https://www.jma.go.jp/bosai/forecast/const/forecast_area.json';
const AMEDAS_TABLE = 'https://www.jma.go.jp/bosai/amedas/const/amedastable.json';
const FORECAST = 'https://www.jma.go.jp/bosai/forecast/data/forecast/';

// 都道府県 → JIS コード。予報区コードの上2桁がこれと一致する。
// stations.mjs の PREFS は沿岸39県ぶんしか無く並び順＝コードではないので、
// ここに明示的に持つ。
const JIS = {
  hokkaido: '01', aomori: '02', iwate: '03', miyagi: '04', akita: '05',
  yamagata: '06', fukushima: '07', ibaraki: '08', chiba: '12', tokyo: '13',
  kanagawa: '14', niigata: '15', toyama: '16', ishikawa: '17', fukui: '18',
  shizuoka: '22', aichi: '23', mie: '24', kyoto: '26', osaka: '27',
  hyogo: '28', wakayama: '30', tottori: '31', shimane: '32', okayama: '33',
  hiroshima: '34', yamaguchi: '35', tokushima: '36', kagawa: '37',
  ehime: '38', kochi: '39', fukuoka: '40', saga: '41', nagasaki: '42',
  kumamoto: '43', oita: '44', miyazaki: '45', kagoshima: '46', okinawa: '47',
};

// forecast_area.json には載っているが、その名前の JSON が置かれていない
// 予報区が2つある。中身は別ファイルにまとめて入っている。気象庁の
// 天気予報ページ自身も同じ読み替えをしている(Forecast.Common.getPathCode)。
function pathCode(office) {
  if (office === '014030') return '014100';   // 十勝 → 釧路・根室・十勝
  if (office === '460040') return '460100';   // 奄美 → 鹿児島県
  return office;
}

async function json(u, attempt = 0) {
  try {
    const res = await fetch(u, { headers: { 'User-Agent': 'japan-tide-atlas static site builder' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      return json(u, attempt + 1);
    }
    throw new Error(`${u} の取得に失敗: ${e.message}`);
  }
}

// アメダス表の緯度経度は [度, 分] で入っている
function dm(a) { return a[0] + a[1] / 60; }

function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// 気象庁の文章は全角スペースを語の区切りに使う。連続分を1つに詰めるだけで、
// 語そのものには手を入れない（「加工」ではなく整形の範囲に留める）。
function tidy(s) {
  if (!s) return null;
  const t = String(s).replace(/[　\s]+/g, '　').trim();
  return t || null;
}

// 波の高さは「０．５メートル」のように全角数字で来る。数字だけ半角にする。
function halfWidth(s) {
  if (!s) return null;
  return s.replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------
// 1府県予報区ぶんの JSON を、日付引きできる形に畳む
// ---------------------------------------------------------------------
function parseOffice(doc) {
  const short = doc[0] || {};
  const week = doc[1] || null;
  const areas = {};    // 一次細分区域コード → { name, dates }
  const temps = {};    // アメダスコード → { name, dates }

  const areaOf = (code, name) => (areas[code] ||= { name, dates: {} });
  const tempOf = (code, name) => (temps[code] ||= { name, dates: {} });

  for (const ts of short.timeSeries || []) {
    const defs = ts.timeDefines || [];
    for (const a of ts.areas || []) {
      // 気温だけはアメダス地点コードで来るので、系列の中身で振り分ける
      if (a.temps) {
        const rec = tempOf(a.area.code, a.area.name);
        defs.forEach((td, i) => {
          const v = numOrNull(a.temps[i]);
          if (v == null) return;
          const d = (rec.dates[td.slice(0, 10)] ||= { max: null, min: null });
          d.max = d.max == null ? v : Math.max(d.max, v);
          d.min = d.min == null ? v : Math.min(d.min, v);
        });
        continue;
      }
      const rec = areaOf(a.area.code, a.area.name);
      defs.forEach((td, i) => {
        const ymd = td.slice(0, 10);
        const d = (rec.dates[ymd] ||= { kind: 'short' });
        if (a.weatherCodes) d.code = a.weatherCodes[i] || null;
        if (a.weathers) d.weather = tidy(a.weathers[i]);
        if (a.winds) d.wind = tidy(a.winds[i]);
        if (a.waves) d.wave = halfWidth(tidy(a.waves[i]));
        // 降水確率は6時間ごと。その日の最大を代表値にする。
        if (a.pops) {
          const p = numOrNull(a.pops[i]);
          if (p != null) d.pop = d.pop == null ? p : Math.max(d.pop, p);
        }
      });
    }
  }

  // 週間予報。短期予報と重なる日は上書きせず、欠けている項目だけを埋める。
  // 短期は明後日まで天気と風を出すが降水確率は明日までしか無い、といった
  // 具合に守備範囲が項目ごとにずれているため。
  const weekWeatherAreas = ((week && week.timeSeries) || [])
    .filter(ts => (ts.areas || []).some(a => a.weatherCodes))
    .flatMap(ts => ts.areas.map(a => a.area.code));

  for (const ts of (week && week.timeSeries) || []) {
    const defs = ts.timeDefines || [];
    for (const a of ts.areas || []) {
      if (a.tempsMax || a.tempsMin) {
        const rec = tempOf(a.area.code, a.area.name);
        defs.forEach((td, i) => {
          const ymd = td.slice(0, 10);
          const mx = numOrNull(a.tempsMax && a.tempsMax[i]);
          const mn = numOrNull(a.tempsMin && a.tempsMin[i]);
          if (mx == null && mn == null) return;
          if (rec.dates[ymd]) return;
          rec.dates[ymd] = { max: mx, min: mn };
        });
        continue;
      }
      if (!a.weatherCodes) continue;
      // 週間予報は一次細分区域より粗い「週間予報区」の単位で出る。多くの県は
      // 県まるごと1区だが、鹿児島（本土と奄美）、釧路根室と十勝、東京と伊豆諸島の
      // ように2区に分かれる県がある。区が一次細分区域コードで来ていれば
      // その区域だけに、府県予報区コードで来ていれば「他の区が名指ししていない
      // 残り全部」に配る。全区域へ一律に配ると、奄美に本土の予報が乗る。
      const named = new Set(weekWeatherAreas.filter(c => areas[c]));
      const targets = areas[a.area.code]
        ? [a.area.code]
        : Object.keys(areas).filter(c => !named.has(c));
      defs.forEach((td, i) => {
        const ymd = td.slice(0, 10);
        const code = a.weatherCodes[i] || null;
        const pop = numOrNull(a.pops && a.pops[i]);
        const rel = (a.reliabilities && a.reliabilities[i]) || null;
        if (code == null && pop == null) return;
        for (const c of targets) {
          const rec = areas[c];
          const d = rec.dates[ymd];
          if (!d) {
            rec.dates[ymd] = {
              kind: 'week', code, weather: telop(code),
              wind: null, wave: null, pop, reliability: rel || null,
            };
            continue;
          }
          if (d.pop == null && pop != null) d.pop = pop;
          if (!d.weather && code != null) { d.code = code; d.weather = telop(code); }
        }
      });
    }
  }

  return { reportTime: short.reportDatetime || null, office: short.publishingOffice || null, areas, temps };
}

// ---------------------------------------------------------------------
// 観測点ぶんの予報をまとめて用意する
//
// 返り値の forecastFor(st, ymd) が、その地点・その日の予報を返す。
// 予報の無い日（過去日や8日以上先）は null。
// ---------------------------------------------------------------------
export async function loadForecast(stations, { concurrency = 6, onProgress } = {}) {
  const [areaMap, amedas] = await Promise.all([json(FORECAST_AREA), json(AMEDAS_TABLE)]);

  // 予報区の候補点（座標つきのアメダス地点）
  const points = [];
  for (const office of Object.keys(areaMap)) {
    for (const a of areaMap[office]) {
      for (const code of a.amedas || []) {
        const t = amedas[code];
        if (!t) continue;   // 表に無いコードが数件ある
        points.push({ office: pathCode(office), class10: a.class10, code, lat: dm(t.lat), lon: dm(t.lon) });
      }
    }
  }

  // 地点 → 予報区の割り当て
  const assign = new Map();
  const offices = new Set();
  const unresolved = [];
  for (const st of stations) {
    const jis = JIS[st.pref];
    const cand = jis ? points.filter(p => p.office.startsWith(jis)) : [];
    if (!cand.length) { unresolved.push(st.name); continue; }
    let best = cand[0], bestKm = km(st, cand[0]);
    for (const p of cand) {
      const d = km(st, p);
      if (d < bestKm) { best = p; bestKm = d; }
    }
    assign.set(st.id, best);
    offices.add(best.office);
  }

  // 必要な府県予報区だけ取りに行く
  const list = [...offices];
  const parsed = {};
  let done = 0;
  const failed = [];
  async function worker() {
    for (;;) {
      const office = list.shift();
      if (!office) return;
      try {
        parsed[office] = parseOffice(await json(FORECAST + office + '.json'));
      } catch (e) {
        // 1予報区が落ちてもサイト全体を止めない。その県だけ気象欄が空になる。
        failed.push(`${office}: ${e.message}`);
      }
      done++;
      if (onProgress) onProgress(done, offices.size);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  function forecastFor(st, ymd) {
    const a = assign.get(st.id);
    if (!a) return null;
    const p = parsed[a.office];
    if (!p) return null;
    const area = p.areas[a.class10];
    const d = area && area.dates[ymd];
    if (!d) return null;

    // 気温は最寄りのアメダス地点から。ただし短期予報が終わったあとの日は
    // 府県の代表地点ぶんしか発表されないので、その日の値を持っている
    // 地点へ落とす。地点名も落とした先のものを出す。
    let t = p.temps[a.code];
    if (!t || !t.dates[ymd]) t = Object.values(p.temps).find(x => x.dates[ymd]) || null;
    const temp = (t && t.dates[ymd]) || null;

    return {
      ...d,
      areaName: area.name,
      spotName: temp ? t.name : null,
      tmax: temp ? temp.max : null,
      tmin: temp ? temp.min : null,
      reportTime: p.reportTime,
      office: p.office,
    };
  }

  return { forecastFor, offices: offices.size, unresolved, failed };
}
