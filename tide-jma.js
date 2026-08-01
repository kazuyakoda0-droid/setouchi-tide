// =====================================================================
// 気象庁 潮位表(推算値)の取得
//
// 気象庁の suisan.php は Access-Control-Allow-Origin が開放されており、
// ブラウザから直接 fetch して本文を読み取れる(CORSブロックなし)。
//
// 1リクエストで最大35日分を返すため、必要な表示範囲を覆うウィンドウを
// まとめて取得し、日ごとに分解して localStorage にキャッシュする。
// 週表示(7日)も月表示(28〜31日)も35日に収まるので、
// 通常は観測点を切り替えたときと月をまたいだときだけ通信が発生する。
//
// util.js / astro.js より後に読み込むこと。
// =====================================================================

const JMA_MAX_WINDOW_DAYS = 35;   // 気象庁側の上限
const _tideStore = makeStore('jma_tide_cache_v2', 2000);

// ---------------------------------------------------------------------
// 三次スプライン補間: 1時間ごとの推算値 → 10分ごとの滑らかなデータ
// ---------------------------------------------------------------------
function naturalCubicSpline(xs, ys) {
  const n = xs.length;
  if (n < 2) return () => ys[0];
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const alpha = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
  }
  // トーマス法
  const l = new Array(n).fill(1), mu = new Array(n).fill(0), z = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  const c = new Array(n).fill(0), b = new Array(n - 1).fill(0), d = new Array(n - 1).fill(0);
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }
  return function (x) {
    let lo = 0, hi = n - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (xs[m] <= x) lo = m; else hi = m - 1; }
    const i = Math.max(0, Math.min(lo, n - 2));
    const dx = x - xs[i];
    return ys[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
  };
}

// 1時間データ(cm, 25点) → 10分データ 144点
function hourlyTo10min(hourlyCm) {
  const spline = naturalCubicSpline(hourlyCm.map((_, i) => i), hourlyCm);
  const out = [];
  for (let i = 0; i < 144; i++) out.push(Math.round(spline(i / 6)));
  return out;
}

// ---------------------------------------------------------------------
// パースとキャッシュ
// ---------------------------------------------------------------------

function _nextDayKey(dk) {
  const p = dk.split('-').map(Number);
  return dayKeyOf(Date.UTC(p[0], p[1] - 1, p[2] + 1));
}

// 欠測(null)を前後の実測値から線形補間で埋める
function _fillNulls(arr) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] == null) {
      let p = i - 1; while (p >= 0 && arr[p] == null) p--;
      let n = i + 1; while (n < arr.length && arr[n] == null) n++;
      arr[i] = (p >= 0 && n < arr.length)
        ? Math.round(arr[p] + (arr[n] - arr[p]) * (i - p) / (n - p))
        : (p >= 0 ? arr[p] : (n < arr.length ? arr[n] : 200));
    }
  }
}

// 公式観測点がない地点向けの近隣補正。
// その日の平均潮位を基準に damp(振幅倍率)と dz(レベル補正)を適用する。
// dphase(位相差)は実データでの検証ができていないため適用しない。
function _applyAnchor(hourly, ex, st) {
  const valid = hourly.filter(v => v != null);
  const mean = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 200;
  const xform = v => Math.round(mean + st.dz + st.damp * (v - mean));
  return {
    hourly: hourly.map(xform),
    ex: ex.map(e => ({
      type: e.type, time: e.time,
      level: mean + st.dz + st.damp * (e.level - mean),
    })),
  };
}

// 潮位表HTML(満潮・干潮表 + 毎時潮位表)を日付ごとに分解
function _parseJmaHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const hiloByDay = {}, hourByDay = {};
  const clean = s => s.replace(/ /g, ' ').trim();

  for (const tbl of doc.querySelectorAll('table')) {
    const firstTr = tbl.querySelector('tr');
    const headText = firstTr ? firstTr.textContent : '';

    if (headText.includes('満潮') && headText.includes('干潮')) {
      for (const tr of tbl.querySelectorAll('tr')) {
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length < 18) continue;
        const dm = clean(tds[0].textContent).match(/(\d{4})\/(\d{2})\/(\d{2})/);
        if (!dm) continue;
        const cells = tds.slice(2, 18).map(td => clean(td.textContent));
        const ex = [];
        for (let i = 0; i < 4; i++) {
          const t = cells[i * 2], l = cells[i * 2 + 1];
          if (t && t !== '*') ex.push({ type: '満潮', timeStr: t, level: parseFloat(l) });
        }
        for (let i = 0; i < 4; i++) {
          const t = cells[8 + i * 2], l = cells[8 + i * 2 + 1];
          if (t && t !== '*') ex.push({ type: '干潮', timeStr: t, level: parseFloat(l) });
        }
        hiloByDay[dm[1] + '-' + dm[2] + '-' + dm[3]] = ex;
      }
    } else if (headText.includes('時刻') && tbl.querySelectorAll('th').length >= 24) {
      for (const tr of tbl.querySelectorAll('tr')) {
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length < 25) continue;
        const dm = clean(tds[0].textContent).match(/(\d{4})\/(\d{2})\/(\d{2})/);
        if (!dm) continue;
        hourByDay[dm[1] + '-' + dm[2] + '-' + dm[3]] = tds.slice(1, 25).map(td => {
          const v = clean(td.textContent);
          return (v === '' || v === '*') ? null : parseFloat(v);
        });
      }
    }
  }
  return { hiloByDay, hourByDay };
}

async function _fetchJmaWindow(stnCode, startMs, endMs) {
  const sd = new Date(startMs), ed = new Date(endMs);
  const url = 'https://www.data.jma.go.jp/kaiyou/db/tide/suisan/suisan.php'
    + '?stn=' + stnCode
    + '&ys=' + sd.getUTCFullYear() + '&ms=' + pad2(sd.getUTCMonth() + 1) + '&ds=' + pad2(sd.getUTCDate())
    + '&ye=' + ed.getUTCFullYear() + '&me=' + pad2(ed.getUTCMonth() + 1) + '&de=' + pad2(ed.getUTCDate())
    + '&S_HILO=on&S_HOUR=on&LV=DL';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('気象庁サーバーエラー(HTTP ' + resp.status + ')');
  return _parseJmaHtml(await resp.text());
}

function _cacheKey(st, dayMs) { return st.id + '_' + dayIndex(dayMs); }

// 表示したい範囲 [fromMs, toMs] を覆うウィンドウを決める。
// 前後に少し余裕を持たせつつ、気象庁の上限35日に収める。
function _windowFor(fromMs, toMs) {
  const span = Math.round((toMs - fromMs) / 86400000) + 1;
  const pad = Math.max(0, Math.floor((JMA_MAX_WINDOW_DAYS - span) / 2));
  const start = fromMs - pad * 86400000;
  const maxEnd = start + (JMA_MAX_WINDOW_DAYS - 1) * 86400000;
  return { startMs: start, endMs: Math.min(maxEnd, toMs + pad * 86400000) };
}

// 指定範囲の全日がキャッシュにあるか
function hasTideRange(st, fromMs, toMs) {
  for (let ms = fromMs; ms <= toMs; ms += 86400000) {
    if (!_tideStore.has(_cacheKey(st, ms))) return false;
  }
  return true;
}

// キャッシュから1日分を取り出す(なければ null)。通信はしない。
function getCachedTide(st, dayMs) {
  return _tideStore.get(_cacheKey(st, dayMs)) || null;
}

// 表示範囲 [fromMs, toMs] を覆うように取得してキャッシュする。
// 範囲が35日を超える場合は複数回に分けて取得する。
async function ensureTideRange(st, fromMs, toMs) {
  if (hasTideRange(st, fromMs, toMs)) return;

  let cursor = fromMs;
  while (cursor <= toMs) {
    const chunkEnd = Math.min(toMs, cursor + (JMA_MAX_WINDOW_DAYS - 1) * 86400000);
    const win = _windowFor(cursor, chunkEnd);
    const parsed = await _fetchJmaWindow(st.jma, win.startMs, win.endMs);
    const dayKeys = Object.keys(parsed.hourByDay).sort();
    if (!dayKeys.length) throw new Error('気象庁データを取得できませんでした');

    for (const dk of dayKeys) {
      const hrs = parsed.hourByDay[dk].slice();
      const nextHrs = parsed.hourByDay[_nextDayKey(dk)];
      // 25点目(翌日0時)。無ければ直前値で延長
      hrs.push(nextHrs ? nextHrs[0] : hrs[hrs.length - 1]);
      _fillNulls(hrs);

      const exRaw = (parsed.hiloByDay[dk] || []).map(e => {
        const hm = e.timeStr.split(':').map(Number);
        return { type: e.type, time: hm[0] + hm[1] / 60, level: e.level };
      });

      let hourly = hrs, ex = exRaw;
      if (st.jmaAnchor) {
        const r = _applyAnchor(hrs, exRaw, st);
        hourly = r.hourly; ex = r.ex;
      }

      const p = dk.split('-').map(Number);
      _tideStore.set(st.id + '_' + dayIndex(Date.UTC(p[0], p[1] - 1, p[2])), {
        levels: hourlyTo10min(hourly),
        extremes: ex,
        source: st.jmaAnchor ? 'jma-anchor' : 'jma',
        stn: st.jma,
      });
    }
    _tideStore.flush();
    cursor = win.endMs + 86400000;
  }
}

// 1日分を取得する。範囲取得のついでにキャッシュされることが多い。
async function fetchTideDay(st, dayMs) {
  const hit = getCachedTide(st, dayMs);
  if (hit) return hit;
  await ensureTideRange(st, dayMs, dayMs);
  const got = getCachedTide(st, dayMs);
  if (!got) throw new Error('指定日は気象庁データの取得範囲外です');
  return got;
}
