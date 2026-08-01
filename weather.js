// =====================================================================
// 気象・海象データの取得 (Open-Meteo)
//
// 改修前のアプリは天気・気温・風・波高・水温・気圧を擬似乱数で生成していた。
// つまり画面に出ていた気象情報はすべて実在しない値だった。
// このモジュールはそれを実データに置き換える。
//
// エンドポイントは2本:
//   forecast API … 天気・気温・風・気圧   (api.open-meteo.com)
//   marine  API … 波高・海面水温          (marine-api.open-meteo.com)
// どちらも APIキー不要、Access-Control-Allow-Origin: * を返す。
//
// past_days=92 & forecast_days=16 で 1地点あたり2リクエスト・108日分をまとめて取得し、
// localStorage にキャッシュする。
//
// 予報は +16日先までしか存在しない。それ以降は値を作らず null のままにし、
// 画面側で「予報範囲外」と表示する。乱数で埋めていた過去の挙動には戻さない。
//
// util.js より後に読み込むこと。
// =====================================================================

const WX_PAST_DAYS = 92;
const WX_FORECAST_DAYS = 16;
const WX_TTL_MS = 3 * 3600 * 1000;   // 当日以降のTTL(過去日は不変なので無期限)

const _wxStore = makeStore('openmeteo_cache_v1', 4000);

// ---------------------------------------------------------------------
// WMO weather code → 日本語表記とアイコン種別
// https://open-meteo.com/en/docs (WMO Weather interpretation codes)
// icon は sun / cloud / rain / snow / thunder の5種。
// 改修前は sun/cloud/rain の3種しかなく、雪の日が「曇り」になっていた。
// ---------------------------------------------------------------------
const WMO = {
  0: ['快晴', 'sun'],
  1: ['晴れ', 'sun'],
  2: ['晴れ時々曇り', 'cloud'],
  3: ['曇り', 'cloud'],
  45: ['霧', 'cloud'],
  48: ['霧氷', 'cloud'],
  51: ['霧雨', 'rain'],
  53: ['霧雨', 'rain'],
  55: ['強い霧雨', 'rain'],
  56: ['着氷性の霧雨', 'rain'],
  57: ['着氷性の霧雨', 'rain'],
  61: ['弱い雨', 'rain'],
  63: ['雨', 'rain'],
  65: ['強い雨', 'rain'],
  66: ['着氷性の雨', 'rain'],
  67: ['着氷性の強い雨', 'rain'],
  71: ['弱い雪', 'snow'],
  73: ['雪', 'snow'],
  75: ['強い雪', 'snow'],
  77: ['細氷', 'snow'],
  80: ['にわか雨', 'rain'],
  81: ['にわか雨', 'rain'],
  82: ['激しいにわか雨', 'rain'],
  85: ['にわか雪', 'snow'],
  86: ['強いにわか雪', 'snow'],
  95: ['雷雨', 'thunder'],
  96: ['雷雨(ひょう)', 'thunder'],
  99: ['激しい雷雨(ひょう)', 'thunder'],
};

function wmoInfo(code) {
  const hit = WMO[code];
  return hit ? { text: hit[0], icon: hit[1] } : { text: '—', icon: 'cloud' };
}

const WIND_DIRS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
  '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];

function windDirName(deg) {
  if (deg == null || isNaN(deg)) return null;
  return WIND_DIRS[Math.round(mod360(deg) / 22.5) % 16];
}

// ---------------------------------------------------------------------
// 取得
// ---------------------------------------------------------------------

function _wxKey(st, dayMs) { return st.id + '_' + dayIndex(dayMs); }

// 地点ごとに「いつ取りに行ったか」を持ち、短時間の重複取得を避ける
const _wxFetchedAt = {};
const _wxInflight = {};

async function _getJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('気象データ取得エラー(HTTP ' + resp.status + ')');
  return resp.json();
}

// hourly 配列から各日の代表値(正午)を取り出す
function _dailyFromHourly(times, values) {
  const byDay = {};
  if (!times || !values) return byDay;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const v = values[i];
    if (v == null) continue;
    const day = t.slice(0, 10);
    const hour = parseInt(t.slice(11, 13), 10);
    // 正午に最も近い値を代表とする
    const prev = byDay[day];
    if (!prev || Math.abs(hour - 12) < Math.abs(prev.hour - 12)) {
      byDay[day] = { hour, value: v };
    }
  }
  const out = {};
  for (const d in byDay) out[d] = byDay[d].value;
  return out;
}

async function _fetchStationWeather(st) {
  const common = 'latitude=' + st.lat + '&longitude=' + st.lon
    + '&timezone=Asia%2FTokyo&past_days=' + WX_PAST_DAYS
    + '&forecast_days=' + WX_FORECAST_DAYS;

  const fcUrl = 'https://api.open-meteo.com/v1/forecast?' + common
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,'
    + 'wind_speed_10m_max,wind_direction_10m_dominant'
    + '&hourly=surface_pressure';

  const mrUrl = 'https://marine-api.open-meteo.com/v1/marine?' + common
    + '&daily=wave_height_max&hourly=sea_surface_temperature';

  // 海象は内湾など格子が海でない地点で失敗しうる。
  // その場合も気象side は活かしたいので個別に握りつぶす。
  const [fc, mr] = await Promise.all([
    _getJson(fcUrl),
    _getJson(mrUrl).catch(() => null),
  ]);

  const d = fc.daily || {};
  const pressureByDay = _dailyFromHourly(
    (fc.hourly || {}).time, (fc.hourly || {}).surface_pressure);
  const sstByDay = mr
    ? _dailyFromHourly((mr.hourly || {}).time, (mr.hourly || {}).sea_surface_temperature)
    : {};
  const waveByDay = {};
  if (mr && mr.daily && mr.daily.time) {
    mr.daily.time.forEach((t, i) => { waveByDay[t] = mr.daily.wave_height_max[i]; });
  }

  const times = d.time || [];
  for (let i = 0; i < times.length; i++) {
    const day = times[i];
    const p = day.split('-').map(Number);
    const dayMs = Date.UTC(p[0], p[1] - 1, p[2]);
    _wxStore.set(st.id + '_' + dayIndex(dayMs), {
      code: d.weather_code ? d.weather_code[i] : null,
      tMax: d.temperature_2m_max ? d.temperature_2m_max[i] : null,
      tMin: d.temperature_2m_min ? d.temperature_2m_min[i] : null,
      windSpeed: d.wind_speed_10m_max ? d.wind_speed_10m_max[i] : null,
      windDir: d.wind_direction_10m_dominant ? d.wind_direction_10m_dominant[i] : null,
      pressure: pressureByDay[day] != null ? pressureByDay[day] : null,
      wave: waveByDay[day] != null ? waveByDay[day] : null,
      sst: sstByDay[day] != null ? sstByDay[day] : null,
    });
  }
  _wxStore.flush();
  _wxFetchedAt[st.id] = Date.now();
}

// 予報範囲(+16日)を超えているか
function isBeyondForecast(dayMs) {
  return dayMs > todayJSTMs() + (WX_FORECAST_DAYS - 1) * 86400000;
}

// 取得済み範囲より過去か
function isBeforeArchive(dayMs) {
  return dayMs < todayJSTMs() - WX_PAST_DAYS * 86400000;
}

// キャッシュから1日分を取り出す。通信はしない。
function getCachedWeather(st, dayMs) {
  const hit = _wxStore.get(_wxKey(st, dayMs));
  if (!hit) return null;
  // 当日以降は鮮度を確認する(過去日は変化しないのでそのまま使う)
  if (dayMs >= todayJSTMs() && Date.now() - (hit._t || 0) > WX_TTL_MS) return null;
  return hit;
}

// 指定日の気象・海象を取得する。
// 予報範囲外なら通信せず null を返す(値を捏造しないため)。
async function fetchWeatherDay(st, dayMs) {
  if (isBeyondForecast(dayMs) || isBeforeArchive(dayMs)) return null;

  const cached = getCachedWeather(st, dayMs);
  if (cached) return cached;

  // 同一地点への同時リクエストは1本にまとめる
  if (!_wxInflight[st.id]) {
    _wxInflight[st.id] = _fetchStationWeather(st)
      .finally(() => { delete _wxInflight[st.id]; });
  }
  await _wxInflight[st.id];
  return getCachedWeather(st, dayMs);
}
