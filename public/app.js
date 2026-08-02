/* =====================================================================
   クライアント側の上乗せ

   潮汐・日月・グラフ・グリッドはすべてサーバ(ビルド)側で描き終わっている。
   ここでやるのは「ビルド時に決められないこと」だけに絞る。

     1. 現在時刻の潮位マーカー（当日ページのみ）
     2. 気象・海象の取得（Open-Meteo。刻々変わるので静的化しない）
     3. 地図（トップ・地方・都道府県ページのみ）

   JS が動かなくてもページの中身は完全に読める。これが検索エンジンに
   内容を渡す唯一の方法であり、旧版が取りこぼしていた点でもある。
   ===================================================================== */
(function () {
  'use strict';

  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var fmtHM = function (dec) {
    var h = Math.floor(dec), m = Math.round((dec - h) * 60);
    if (m === 60) { m = 0; h += 1; }
    return pad2(h % 24) + ':' + pad2(m);
  };

  // JST の現在時刻を「0時からの小数時」で返す
  function nowHourJST() {
    var j = new Date(Date.now() + 9 * 3600000);
    return j.getUTCHours() + j.getUTCMinutes() / 60 + j.getUTCSeconds() / 3600;
  }

  // -------------------------------------------------------------------
  // 1. 現在の潮位
  // -------------------------------------------------------------------
  function currentTide() {
    var el = document.querySelector('[data-now]');
    if (!el) return;
    var levels = el.getAttribute('data-levels').split(',').map(Number);
    if (levels.length !== 144) return;

    var h = nowHourJST();
    var idx = Math.min(143, Math.max(0, Math.round(h * 6)));
    var cur = levels[idx];

    // 変化速度 cm/h（前後10分の中央差分）
    var a = levels[Math.max(0, idx - 1)], b = levels[Math.min(143, idx + 1)];
    var span = (Math.min(143, idx + 1) - Math.max(0, idx - 1)) / 6;
    var rate = span > 0 ? (b - a) / span : 0;
    var dir = rate > 3 ? '上げ潮' : rate < -3 ? '下げ潮' : '転流';

    // 次の満潮・干潮。10分毎の系列から極値を探すと公式値と数分ずれ、
    // すぐ下の表と食い違うので、気象庁の値(data-ext)をそのまま使う。
    var nxt = '';
    var ext = (el.getAttribute('data-ext') || '').split(',').filter(Boolean);
    for (var e = 0; e < ext.length; e++) {
      var t = parseFloat(ext[e].slice(1));
      if (t > h) {
        var mins = Math.round((t - h) * 60);
        nxt = (ext[e][0] === 'H' ? '次の満潮' : '次の干潮') + ' ' + fmtHM(t)
          + '（あと' + (mins >= 60 ? Math.floor(mins / 60) + '時間' + (mins % 60) + '分' : mins + '分') + '）';
        break;
      }
    }
    if (!nxt && ext.length) nxt = '次の満潮・干潮は翌日です';

    el.innerHTML =
      '<span class="lbl">Now</span>'
      + '<span class="val">' + cur + '<small>cm</small></span>'
      + '<span class="dir">' + dir + '</span>'
      + '<span class="rate">' + (rate >= 0 ? '+' : '') + rate.toFixed(0) + ' cm/h</span>'
      + (nxt ? '<span class="nxt">' + nxt + '</span>' : '');

    markGraph(levels, h);
    markGrid(idx);
  }

  function markGraph(levels, h) {
    var svg = document.querySelector('svg[data-graph]');
    if (!svg) return;
    var x0 = +svg.dataset.x0, x1 = +svg.dataset.x1;
    var y0 = +svg.dataset.y0, y1 = +svg.dataset.y1;
    var lo = +svg.dataset.lo, hi = +svg.dataset.hi;

    var idx = Math.min(143, Math.max(0, Math.round(h * 6)));
    var x = x0 + (x1 - x0) * (idx / 143);
    var y = y1 - (y1 - y0) * ((levels[idx] - lo) / (hi - lo));
    var NS = 'http://www.w3.org/2000/svg';

    var line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x); line.setAttribute('y1', y0);
    line.setAttribute('x2', x); line.setAttribute('y2', y1);
    line.setAttribute('class', 'nowline');

    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 6);
    dot.setAttribute('class', 'nowdot');

    svg.appendChild(line);
    svg.appendChild(dot);
  }

  function markGrid(idx) {
    var grid = document.querySelector('[data-grid]');
    if (!grid) return;
    // 先頭 7セルはヘッダー行。以降は 1時間あたり 1(時ラベル) + 6(値)。
    var row = Math.floor(idx / 6), col = idx % 6;
    var pos = 7 + row * 7 + 1 + col;
    var cell = grid.children[pos];
    if (cell) {
      cell.classList.add('now');
      cell.setAttribute('title', '現在時刻');
    }
  }

  // -------------------------------------------------------------------
  // 2. 気象・海象（Open-Meteo）
  // -------------------------------------------------------------------
  var WMO = {
    0: '快晴', 1: '晴れ', 2: '晴れ時々曇り', 3: '曇り', 45: '霧', 48: '霧氷',
    51: '霧雨', 53: '霧雨', 55: '強い霧雨', 56: '着氷性の霧雨', 57: '着氷性の霧雨',
    61: '弱い雨', 63: '雨', 65: '強い雨', 66: '着氷性の雨', 67: '着氷性の強い雨',
    71: '弱い雪', 73: '雪', 75: '強い雪', 77: '細氷',
    80: 'にわか雨', 81: 'にわか雨', 82: '激しいにわか雨', 85: 'にわか雪', 86: '強いにわか雪',
    95: '雷雨', 96: '雷雨(ひょう)', 99: '激しい雷雨(ひょう)',
  };
  var DIRS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
    '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];

  function windName(deg) {
    if (deg == null || isNaN(deg)) return null;
    return DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  }

  // hourly 配列から正午に最も近い値を取る
  function noonValue(times, values) {
    if (!times || !values) return null;
    var best = null, bestGap = 99;
    for (var i = 0; i < times.length; i++) {
      if (values[i] == null) continue;
      var gap = Math.abs(parseInt(times[i].slice(11, 13), 10) - 12);
      if (gap < bestGap) { bestGap = gap; best = values[i]; }
    }
    return best;
  }

  function cell(k, v, unit) {
    if (v == null) return '';
    return '<div><span class="k">' + k + '</span><span class="v">' + v
      + (unit ? '<small>' + unit + '</small>' : '') + '</span></div>';
  }

  function weather() {
    var el = document.querySelector('[data-wx]');
    if (!el) return;
    var lat = el.dataset.lat, lon = el.dataset.lon, date = el.dataset.date;

    // 予報は +16日まで、アーカイブは過去92日まで。範囲外は取りに行かない。
    var today = new Date(Date.now() + 9 * 3600000);
    var t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    var p = date.split('-').map(Number);
    var d0 = Date.UTC(p[0], p[1] - 1, p[2]);
    var diff = Math.round((d0 - t0) / 86400000);
    if (diff > 15 || diff < -92) {
      el.innerHTML = '<p class="wx-err">この日は気象予報の範囲外です（予報は16日先まで）。'
        + '潮位は気象庁の推算値なので通年で表示されます。</p>';
      return;
    }

    var common = 'latitude=' + lat + '&longitude=' + lon
      // Open-Meteo の風速は既定が km/h。m/s で出したいので明示指定する。
      + '&timezone=Asia%2FTokyo&wind_speed_unit=ms&start_date=' + date + '&end_date=' + date;
    var fcUrl = 'https://api.open-meteo.com/v1/forecast?' + common
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,'
      + 'wind_speed_10m_max,wind_direction_10m_dominant&hourly=surface_pressure';
    var mrUrl = 'https://marine-api.open-meteo.com/v1/marine?' + common
      + '&daily=wave_height_max&hourly=sea_surface_temperature';

    var json = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw 0; return r.json(); }); };

    // 海象は内湾など格子が海でない地点で失敗しうる。気象側は活かす。
    Promise.all([json(fcUrl), json(mrUrl).catch(function () { return null; })])
      .then(function (res) {
        var fc = res[0], mr = res[1];
        var d = (fc && fc.daily) || {};
        var code = d.weather_code ? d.weather_code[0] : null;
        var press = noonValue((fc.hourly || {}).time, (fc.hourly || {}).surface_pressure);
        var sst = mr ? noonValue((mr.hourly || {}).time, (mr.hourly || {}).sea_surface_temperature) : null;
        var wave = mr && mr.daily && mr.daily.wave_height_max ? mr.daily.wave_height_max[0] : null;
        var wd = d.wind_direction_10m_dominant ? windName(d.wind_direction_10m_dominant[0]) : null;
        var ws = d.wind_speed_10m_max ? d.wind_speed_10m_max[0] : null;

        var body = '';
        if (code != null) {
          body += '<div class="wx-head"><span class="cond">' + (WMO[code] || '—') + '</span></div>';
        }
        body += '<div class="wx-grid">'
          + cell('気温', (d.temperature_2m_max && d.temperature_2m_min)
            ? Math.round(d.temperature_2m_max[0]) + ' / ' + Math.round(d.temperature_2m_min[0]) : null, '℃')
          + cell('風', (wd && ws != null) ? wd + ' ' + ws.toFixed(1) : null, 'm/s')
          + cell('気圧', press != null ? Math.round(press) : null, 'hPa')
          + cell('波高', wave != null ? wave.toFixed(1) : null, 'm')
          + cell('水温', sst != null ? sst.toFixed(1) : null, '℃')
          + '</div>';
        el.innerHTML = body;
      })
      .catch(function () {
        el.innerHTML = '<p class="wx-err">気象データを取得できませんでした。'
        + '潮位は気象庁の推算値なので、この欄が空でも上の潮汐は正しく表示されています。</p>';
      });
  }

  // -------------------------------------------------------------------
  // 3. 地図
  // -------------------------------------------------------------------
  var mapDone = false;
  function maps() {
    if (mapDone) return;
    var el = document.querySelector('[data-map]');
    if (!el || typeof L === 'undefined') return;
    var pts = JSON.parse(el.dataset.stations || '[]');
    if (!pts.length) return;
    mapDone = true;

    // レンダラは SVG(Leaflet 既定)。
    // Canvas のほうがパン/ズームは軽いが、Canvas レンダラは
    // requestAnimationFrame で描画するため、描画が走らない環境では
    // タイルだけ出て点が1つも描かれないという壊れ方をする。
    // ここでは scrollWheelZoom を切っていてパン/ズームの頻度が低く、
    // SVG の重さが問題になりにくいので、確実に描ける側を採る。
    var map = L.map(el, {
      scrollWheelZoom: false, // ページスクロールを奪わない
      attributionControl: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap · CARTO', maxZoom: 18,
    }).addTo(map);

    // Leaflet はビュー(中心とズーム)が決まる前にレイヤを追加できない。
    // 先に fitBounds でビューを確定させてからマーカーを載せる。
    // 順序を逆にすると例外になり、地図はタイルだけが出て点が1つも描かれない。
    var bounds = pts.map(function (p) { return [p.la, p.lo]; });
    map.fitBounds(bounds, { padding: [24, 24] });

    pts.forEach(function (p) {
      var m = L.circleMarker([p.la, p.lo], {
        radius: 5,
        color: p.o ? '#2b5d7a' : '#a99e8c',
        weight: p.o ? 2 : 1.5,
        fillColor: p.o ? '#2b5d7a' : '#fbfaf5',
        fillOpacity: p.o ? .85 : 1,
      }).addTo(map);
      m.bindTooltip(p.n, { direction: 'top', className: 'tdtip' });
      m.on('click', function () { location.href = p.h; });
    });

    // スクロールズームはクリックで有効化（モバイルのページスクロール対策）
    map.on('click', function () { map.scrollWheelZoom.enable(); });
  }

  // 例外は握り潰さずコンソールに出す。1つの機能が落ちても他は動かしたいので
  // 個別に囲うが、黙って消すと地図が真っ白でも気づけない。
  function run(name, fn) {
    try { fn(); } catch (e) { console.error('[tide] ' + name + ' failed:', e); }
  }

  function init() {
    run('currentTide', currentTide);
    run('weather', weather);
    run('maps', maps);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Leaflet は defer で後から来るので、読み込み完了後にもう一度試す
  window.addEventListener('load', function () { run('maps', maps); });
})();
