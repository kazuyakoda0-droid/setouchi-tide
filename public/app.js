/* =====================================================================
   クライアント側の上乗せ

   潮汐・日月・グラフ・グリッドはすべてサーバ(ビルド)側で描き終わっている。
   ここでやるのは「ビルド時に決められないこと」だけに絞る。

     1. 現在時刻の潮位マーカー（当日ページのみ）
     2. 地図（トップ・地方・都道府県ページのみ）
     3. 潮干狩り/磯遊びしきい値ハイライト（10分毎グリッド・月間カレンダー）
     4. 地点検索・最近見た地点（全ページ共通のヘッダー）
     5. 表のコピー / CSV 書き出し

   気象・海象はここには無い。気象庁の天気予報をビルド時に取得して
   HTML に焼き込んでいる（lib/forecast.mjs）。閲覧者のブラウザから
   気象庁を叩かないので、先方に負荷をかけず、検索エンジンにも読まれる。

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

  // 「次の満潮/干潮まであと…」を計算してテキストを返す。
  // ext: data-ext をパースした配列（例: ['H8.98', 'L15.02', ...]）
  // h: 現在時刻（0時からの小数時、秒を含む）
  function nextExtremeText(ext, h) {
    for (var e = 0; e < ext.length; e++) {
      var t = parseFloat(ext[e].slice(1));
      if (t > h) {
        var totalSec = Math.round((t - h) * 3600);
        var hh = Math.floor(totalSec / 3600);
        var mm = Math.floor((totalSec % 3600) / 60);
        var ss = totalSec % 60;
        var rest = (hh > 0 ? hh + '時間' : '') + mm + '分' + ss + '秒';
        return (ext[e][0] === 'H' ? '次の満潮' : '次の干潮') + ' ' + fmtHM(t)
          + '（あと' + rest + '）';
      }
    }
    return ext.length ? '次の満潮・干潮は翌日です' : '';
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
    var ext = (el.getAttribute('data-ext') || '').split(',').filter(Boolean);

    el.innerHTML =
      '<span class="lbl">Now</span>'
      + '<span class="val">' + cur + '<small>cm</small></span>'
      + '<span class="dir">' + dir + '</span>'
      + '<span class="rate">' + (rate >= 0 ? '+' : '') + rate.toFixed(0) + ' cm/h</span>'
      + '<span class="nxt"></span>';

    markGraph(levels, h);
    markGrid(idx);

    // 「あと…」の秒の部分だけ1秒ごとに更新する。満干潮をまたいだら
    // data-ext の次のエントリへ自動的に切り替わり、当日分を使い切ったら
    // 「翌日です」の静的表示に切り替えて止まる。
    var nxtEl = el.querySelector('.nxt');
    if (nxtEl && ext.length) {
      var timer;
      var tick = function () {
        var text = nextExtremeText(ext, nowHourJST());
        nxtEl.textContent = text;
        if (!/あと/.test(text)) clearInterval(timer);
      };
      tick();
      timer = setInterval(tick, 1000);
    }
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

    // 数値はグラフの中で読めるようにする。右端に近いときだけ左に寄せ、
    // ラベルが SVG の外へはみ出ないようにする。
    var label = document.createElementNS(NS, 'text');
    var onRight = x < x1 - 106;
    label.setAttribute('x', x + (onRight ? 12 : -12));
    label.setAttribute('y', Math.max(y0 + 20, y - 12));
    label.setAttribute('text-anchor', onRight ? 'start' : 'end');
    label.setAttribute('class', 'nowlabel');
    label.textContent = 'いま ' + levels[idx] + 'cm';

    svg.appendChild(line);
    svg.appendChild(dot);
    svg.appendChild(label);
  }

  function markGrid(idx) {
    var grid = document.querySelector('[data-grid]');
    if (!grid) return;
    // 先頭 7セルはヘッダー行。以降は 1時間あたり 1(時ラベル) + 6(値)。
    var row = Math.floor(idx / 6), col = idx % 6;
    var pos = 7 + row * 7 + 1 + col;
    var cell = grid.children[pos];
    if (cell) {
      cell.classList.add('td-now');
      cell.setAttribute('title', '現在時刻');
    }
  }

  // -------------------------------------------------------------------
  // 1.5 タイドグラフの日送りスワイプ
  //
  // グラフそのものを画像にせず日別ページを持たせているため、左右スワイプは
  // 次/前日の静的ページへ移動する。各日を URL で共有でき、JavaScript が
  // 無効でも表示できる構成を保ったまま、先のグラフを連続して見られる。
  // -------------------------------------------------------------------
  function graphSwipe() {
    var graphs = document.querySelectorAll('[data-graph-swipe]');
    Array.prototype.forEach.call(graphs, function (graph) {
      var startX = 0, startY = 0, tracking = false;
      graph.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
      }, { passive: true });
      graph.addEventListener('touchend', function (e) {
        if (!tracking || !e.changedTouches.length) return;
        tracking = false;
        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        var href = dx < 0 ? graph.dataset.next : graph.dataset.prev;
        if (href) location.assign(href);
      }, { passive: true });
    });
  }

  // -------------------------------------------------------------------
  // 2. 地図
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
    // ここではパン/ズームの頻度がさほど高くなく、SVG の重さが問題に
    // なりにくいので、確実に描ける側を採る。
    var map = L.map(el, {
      scrollWheelZoom: true,
      attributionControl: true,
    });
    // 明るい voyager タイルはダークモードの画面で浮いて見えるので、
    // OS設定がダークのときは CARTO の dark_all タイルに切り替える。
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var tileStyle = dark ? 'dark_all' : 'voyager';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/' + tileStyle + '/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap · CARTO', maxZoom: 18,
    }).addTo(map);

    // Leaflet はビュー(中心とズーム)が決まる前にレイヤを追加できない。
    // 先に fitBounds でビューを確定させてからマーカーを載せる。
    // 順序を逆にすると例外になり、地図はタイルだけが出て点が1つも描かれない。
    var bounds = pts.map(function (p) { return [p.la, p.lo]; });
    // 地点ページは自分＋近隣6点しか載らない。密集した瀬戸内では
    // fitBounds が z16 まで寄ってしまい、海岸線しか映らなくなる。
    // data-fit-max があるときは寄せすぎを止める。
    var fitMax = Number(el.dataset.fitMax) || 0;
    map.fitBounds(bounds, fitMax ? { padding: [24, 24], maxZoom: fitMax } : { padding: [24, 24] });

    pts.forEach(function (p) {
      // p.c = このページの地点。近隣と同じ見た目だとどれが自分か分からない。
      var m;
      if (!p.c && p.m === 'low') {
        // 精度保証の対象外となる参考地点だけを三角にする。
        m = L.marker([p.la, p.lo], {
          icon: L.divIcon({ className: 'tide-map-marker', html: '<span class="marker-triangle" aria-hidden="true"></span>', iconSize: [14, 14], iconAnchor: [7, 7] }),
        }).addTo(map);
      } else m = L.circleMarker([p.la, p.lo], p.c ? {
        radius: 8, color: '#b06a3f', weight: 3,
        fillColor: '#b06a3f', fillOpacity: .9,
      } : {
        radius: 5,
        color: '#175a6f', weight: 2,
        fillColor: p.m === 'apx' ? '#fffaf0' : '#175a6f',
        fillOpacity: p.m === 'apx' ? 1 : .85,
      }).addTo(map);
      // 自分の点は常時ラベルを出す。近隣はホバー時だけ出し、押すと移動する。
      m.bindTooltip(p.n, { direction: 'top', className: 'tdtip', permanent: !!p.c });
      if (!p.c) m.on('click', function () { location.href = p.h; });
    });

    // ホイールでそのまま拡大縮小できるようにしてある。ただし常時有効に
    // すると、ページを流し読みしている途中で地図の上をカーソルが通った
    // だけでスクロールが地図に吸われ、そこから先へ進めなくなる。
    //
    // 「ページがスクロール中のあいだだけホイールズームを切る」ことで
    // 両立させる。地図の上で止まった状態からホイールを回した場合は、
    // 地図がホイールを食う＝ページは動かない＝scroll イベントが出ないので
    // ズームは有効なまま。逆に流し読み中はスクロールが続いている＝
    // scroll イベントが出続けるので、ホイールはページ側に通り抜ける。
    var reenable = null;
    window.addEventListener('scroll', function () {
      map.scrollWheelZoom.disable();
      clearTimeout(reenable);
      reenable = setTimeout(function () { map.scrollWheelZoom.enable(); }, 300);
    }, { passive: true });

    // 地点ページの地図は grid の伸縮で高さが決まる。Leaflet は初期化時の
    // 寸法を覚えるので、レイアウトが確定したあとに測り直させないと
    // タイルが欠けたり中心がずれたりする。
    var resized = null;
    var remeasure = function () { map.invalidateSize({ animate: false }); };
    window.addEventListener('load', remeasure);
    window.addEventListener('resize', function () {
      clearTimeout(resized);
      resized = setTimeout(remeasure, 200);
    });
  }

  // -------------------------------------------------------------------
  // 3. 潮干狩り/磯遊びしきい値ハイライト
  //
  // しきい値(cm)は地点・日によって適切な値が違い、ビルド時には決められない。
  // 10分毎グリッドのセルは既に潮位の数値をテキストで持っているので、
  // 追加のdata属性を焼き込まずにテキストをそのまま読んで判定する。
  // 月間カレンダーは干潮の一覧(.cal-ex li.l em)を同様に読む。
  // -------------------------------------------------------------------
  var TH_KEY = 'tide-threshold-cm';
  var TH_DEFAULT = 30;

  function applyThreshold(threshold) {
    var cells = document.querySelectorAll('.tdgrid .tdcell');
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.className.indexOf('hd') !== -1 || c.className.indexOf('hh') !== -1) continue;
      var v = parseInt(c.textContent, 10);
      c.classList.toggle('th-hit', !isNaN(v) && v <= threshold);
    }

    var days = document.querySelectorAll('.cal-cell');
    for (var d = 0; d < days.length; d++) {
      var lows = days[d].querySelectorAll('.cal-ex li.l em');
      var hit = false;
      for (var e = 0; e < lows.length; e++) {
        var lv = parseInt(lows[e].textContent, 10);
        if (!isNaN(lv) && lv <= threshold) { hit = true; break; }
      }
      days[d].classList.toggle('th-hit', hit);
    }
  }

  function readSavedThreshold() {
    try {
      var v = parseInt(localStorage.getItem(TH_KEY), 10);
      return isNaN(v) ? TH_DEFAULT : v;
    } catch (e) { return TH_DEFAULT; }
  }

  function saveThreshold(v) {
    try { localStorage.setItem(TH_KEY, String(v)); } catch (e) { /* private browsing 等では諦める */ }
  }

  function thresholdMode() {
    var inputs = document.querySelectorAll('[data-th-input]');
    if (!inputs.length) return;

    var initial = readSavedThreshold();
    for (var i = 0; i < inputs.length; i++) inputs[i].value = initial;
    applyThreshold(initial);

    Array.prototype.forEach.call(inputs, function (input) {
      input.addEventListener('input', function () {
        var v = parseInt(input.value, 10);
        if (isNaN(v)) return;
        Array.prototype.forEach.call(inputs, function (other) {
          if (other !== input) other.value = v;
        });
        saveThreshold(v);
        applyThreshold(v);
      });
    });
  }

  // -------------------------------------------------------------------
  // 4. 地点検索・最近見た地点
  //
  // 全771地点ぶんのインデックス(stations-index.json)はヘッダーの検索
  // ボタンを押すまで取得しない。地点ページを開くたびに data-recent を
  // localStorage に積んでおき、次に検索を開いたときの候補として出す。
  // -------------------------------------------------------------------
  var RECENT_KEY = 'tide-recent-stations';
  var RECENT_MAX = 8;

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }

  // 地点に紐づくページ(地点ハブ・日別・週間・月間)は body に data-recent
  // ({n,h,p}のJSON)を持つ。同じ地点は先頭に上げて重複させない。
  function recordRecent() {
    var raw = document.body.dataset.recent;
    if (!raw) return;
    var item;
    try { item = JSON.parse(raw); } catch (e) { return; }
    if (!item || !item.h) return;
    var list = readRecent().filter(function (x) { return x.h !== item.h; });
    list.unshift(item);
    if (list.length > RECENT_MAX) list.length = RECENT_MAX;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* private browsing 等では諦める */ }
  }

  function stationLi(s) {
    return '<li><a href="' + escHtml(s.h) + '"><span class="nm">' + escHtml(s.n)
      + '</span><span class="pf">' + escHtml(s.p) + '</span></a></li>';
  }

  var searchIndex = null, searchLoading = null;
  function loadSearchIndex(src) {
    if (searchIndex) return Promise.resolve(searchIndex);
    if (searchLoading) return searchLoading;
    searchLoading = fetch(src).then(function (r) { return r.json(); })
      .then(function (data) { searchIndex = data; return data; })
      .catch(function () { return []; });
    return searchLoading;
  }

  function searchModal() {
    var openBtn = document.querySelector('[data-search-open]');
    var ovl = document.querySelector('[data-search-ovl]');
    if (!openBtn || !ovl) return;
    var input = ovl.querySelector('[data-search-input]');
    var closeBtn = ovl.querySelector('[data-search-close]');
    var recentEl = ovl.querySelector('[data-search-recent]');
    var resultsEl = ovl.querySelector('[data-search-results]');
    var emptyEl = ovl.querySelector('[data-search-empty]');
    var src = openBtn.dataset.searchSrc;

    function renderRecent() {
      var list = readRecent();
      recentEl.innerHTML = list.length
        ? '<p class="search-sub">最近見た地点</p><ul class="search-results">' + list.map(stationLi).join('') + '</ul>'
        : '';
    }

    function renderResults(list, q) {
      var ql = (q || '').trim();
      if (!ql) { resultsEl.innerHTML = ''; emptyEl.hidden = true; recentEl.style.display = ''; return; }
      recentEl.style.display = 'none';
      var hit = list.filter(function (s) {
        return s.n.indexOf(ql) !== -1 || (s.k && s.k.indexOf(ql) !== -1) || s.p.indexOf(ql) !== -1;
      }).slice(0, 30);
      resultsEl.innerHTML = hit.map(stationLi).join('');
      emptyEl.hidden = hit.length !== 0;
    }

    function open() {
      ovl.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      renderRecent();
      renderResults([], '');
      if (src) loadSearchIndex(src);
      setTimeout(function () { input.focus(); }, 0);
    }

    function close() {
      ovl.hidden = true;
      document.documentElement.style.overflow = '';
    }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    ovl.addEventListener('click', function (e) { if (e.target === ovl) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !ovl.hidden) close();
    });
    input.addEventListener('input', function () {
      var q = input.value;
      if (!q.trim()) { renderResults([], ''); return; }
      loadSearchIndex(src).then(function (list) { renderResults(list, q); });
    });
  }

  // -------------------------------------------------------------------
  // 5. 表のコピー / CSV 書き出し
  //
  // 潮見表は「表計算ソフトに持っていって自分で加工したい」という需要が
  // 大きい。ビルド時に .csv を1万ページぶん吐く手もあるが、配信物が
  // 20MB 以上ふくらむ割に大半はダウンロードされない。画面に出ている表を
  // その場で組み立てるほうが、追加コスト0でどのページでも同じように効く。
  // -------------------------------------------------------------------

  // 要素のテキスト。<br> は区切りとして残す。
  // 週間表のセルは「05:12 <small>340</small><br>17:30 <small>210</small>」なので、
  // textContent をそのまま取ると "05:12 34017:30 210" と癒着して読めなくなる。
  function txt(el) {
    if (!el) return '';
    var out = '';
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) out += c.nodeValue;
        else if (c.nodeType === 1) {
          if (c.tagName === 'BR') out += ' / ';
          else walk(c);
        }
      }
    })(el);
    return out.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function num(s) {
    var m = /-?\d+(?:\.\d+)?/.exec(s || '');
    return m ? m[0] : '';
  }

  // 「05:12 340 / 17:30 210」→ [['05:12','340'], ['17:30','210']]
  // 区切りに \D* ではなく [^\d-]* を使うのは、潮位が負値(-5cm)のとき
  // \D* が先にマイナス記号を食べてしまい "5" と読めてしまうため。
  function pairs(s) {
    var out = [], re = /(\d{1,2}:\d{2})[^\d-]*(-?\d+)/g, m;
    while ((m = re.exec(s))) out.push([m[1], m[2]]);
    return out;
  }

  function liText(el, sel) {
    return Array.prototype.map.call(el.querySelectorAll(sel), function (n) { return txt(n); }).join(' / ');
  }

  // 満潮・干潮は日によって本数が変わる（1〜3回）。セル内で改行して
  // 詰め込むと表計算側で分解できないので、その月・その週の最大本数に
  // 合わせて「満潮1時刻 / 満潮1潮位cm / 満潮2時刻 …」と桁を開く。
  function expand(headLead, headTail, recs) {
    var mh = 0, ml = 0, i;
    recs.forEach(function (r) {
      if (r.h.length > mh) mh = r.h.length;
      if (r.l.length > ml) ml = r.l.length;
    });
    var hd = headLead.slice();
    for (i = 0; i < mh; i++) hd.push('満潮' + (i + 1) + '時刻', '満潮' + (i + 1) + '潮位cm');
    for (i = 0; i < ml; i++) hd.push('干潮' + (i + 1) + '時刻', '干潮' + (i + 1) + '潮位cm');
    var out = [hd.concat(headTail)];
    recs.forEach(function (r) {
      var row = r.lead.slice();
      for (i = 0; i < mh; i++) row.push(r.h[i] ? r.h[i][0] : '', r.h[i] ? r.h[i][1] : '');
      for (i = 0; i < ml; i++) row.push(r.l[i] ? r.l[i][0] : '', r.l[i] ? r.l[i][1] : '');
      out.push(row.concat(r.tail));
    });
    return out;
  }

  // 満潮・干潮の一覧
  function extExtract(t) {
    var rows = [['区分', '時刻', '潮位cm']];
    Array.prototype.forEach.call(t.tBodies[0].rows, function (tr) {
      rows.push([
        txt(tr.cells[0]).replace(/[▲▼\s]/g, ''),
        txt(tr.cells[1]),
        num(txt(tr.cells[2])),
      ]);
    });
    return rows;
  }

  // 10分毎グリッド。画面は 24行×6列だが、書き出しは1行1時刻の縦持ちにする。
  // 表計算でグラフを描いたり関数をかけたりするには横持ちだと使えない。
  function gridExtract(g) {
    var c = g.children, date = pageDate(), rows = [['日付', '時刻', '潮位cm']];
    for (var h = 0; h < 24; h++) {
      for (var k = 0; k < 6; k++) {
        // 先頭7セルはヘッダー行。以降は 1時間あたり 1(時ラベル) + 6(値)。
        var cell = c[7 + h * 7 + 1 + k];
        if (!cell) continue;
        rows.push([date, pad2(h) + ':' + pad2(k * 10), txt(cell)]);
      }
    }
    return rows;
  }

  // 10分毎グリッドの書き出しに付ける日付。グリッドがあるのは地点ページと
  // 日別ページだけで、どちらも body の data-file が「地点名_YYYY-MM-DD」。
  function pageDate() {
    var m = /(\d{4}-\d{2}-\d{2})/.exec(document.body.dataset.file || '');
    return m ? m[1] : '';
  }

  function weekExtract(t) {
    var recs = [];
    Array.prototype.forEach.call(t.tBodies[0].rows, function (tr) {
      // 見出しセルは「8/2 土」。年が入らないので日別ページへのリンクから拾う。
      var a = tr.cells[0].querySelector('a');
      var m = a && /(\d{4}-\d{2}-\d{2})/.exec(decodeURIComponent(a.getAttribute('href') || ''));
      recs.push({
        lead: [m ? m[1] : txt(tr.cells[0]), txt(tr.cells[0].querySelector('.wd')), txt(tr.cells[1])],
        h: pairs(txt(tr.cells[2])),
        l: pairs(txt(tr.cells[3])),
        tail: [txt(tr.cells[4])],
      });
    });
    return expand(['日付', '曜日', '潮名'], ['月齢'], recs);
  }

  function prefExtract(t) {
    var recs = [];
    Array.prototype.forEach.call(t.tBodies[0].rows, function (tr) {
      recs.push({
        lead: [txt(tr.cells[0]), txt(tr.cells[1])],
        h: pairs(txt(tr.cells[2])),
        l: pairs(txt(tr.cells[3])),
        tail: [num(txt(tr.cells[4]))],
      });
    });
    return expand(['地点', '潮名'], ['干満差cm'], recs);
  }

  function calExtract(cal) {
    // カレンダーのセルには日だけしか出ていないので、年月は URL から取る。
    var ym = /(\d{4}-\d{2})(?:\/|$)/.exec(decodeURIComponent(location.pathname));
    var recs = [];
    Array.prototype.forEach.call(cal.querySelectorAll('.cal-cell'), function (c) {
      var d = c.querySelector('.cal-d');
      if (!d) return;
      var dd = pad2(txt(d));
      recs.push({
        lead: [ym ? ym[1] + '-' + dd : dd, txt(c.querySelector('.cal-w')), txt(c.querySelector('.cal-s'))],
        h: pairs(liText(c, 'li.h')),
        l: pairs(liText(c, 'li.l')),
        tail: [],
      });
    });
    return expand(['日付', '曜日', '潮名'], [], recs);
  }

  // [セレクタ, 名前, 抽出関数, ボタンを差し込む位置(祖先セレクタ), 形の補足]
  var TABLES = [
    ['table.ext', '満干潮', extExtract, null, ''],
    ['.tdgrid', '10分毎潮位', gridExtract, null,
      '画面は24行×6列ですが、書き出しは1行1時刻（日付・時刻・潮位cm）の形になります。'],
    ['table.week', '週間', weekExtract, '.tw',
      '満潮・干潮は「満潮1時刻・満潮1潮位cm・満潮2時刻…」と列に開いて書き出します。'],
    ['table.prefsum', '地点別', prefExtract, '.tw',
      '満潮・干潮は「満潮1時刻・満潮1潮位cm・満潮2時刻…」と列に開いて書き出します。'],
    ['.cal', '月間', calExtract, null,
      '満潮・干潮は「満潮1時刻・満潮1潮位cm・満潮2時刻…」と列に開いて書き出します。'],
  ];

  function csvField(v) {
    var s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) {
    return rows.map(function (r) { return r.map(csvField).join(','); }).join('\r\n');
  }
  function toTSV(rows) {
    // 貼り付け用。セル内にタブや改行が混じると列がずれるので潰す。
    return rows.map(function (r) {
      return r.map(function (v) {
        return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
      }).join('\t');
    }).join('\r\n');
  }

  function legacyCopy(text) {
    // navigator.clipboard は https / localhost でしか使えない。
    // 素の http で開かれた場合のための代替。
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copy(text, btn) {
    var done = function (ok) {
      btn.textContent = ok ? 'コピーしました' : 'コピーできません';
      btn.className = 'tbtn' + (ok ? ' ok' : '');
      setTimeout(function () { btn.textContent = 'コピー'; btn.className = 'tbtn'; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { done(legacyCopy(text)); });
    } else {
      done(legacyCopy(text));
    }
  }

  function download(text, name) {
    // 先頭の BOM は必須。これが無いと Excel は UTF-8 の CSV を Shift_JIS と
    // 誤認し、地点名も見出しもすべて文字化けする。
    var url = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function fileName(name) {
    var base = (document.body.dataset.file || 'tide').replace(/[\\/:*?"<>|]/g, '');
    return base + '_' + name + '.csv';
  }

  function bar(name, build, el, hint) {
    var d = document.createElement('div');
    d.className = 'tbar';

    var b1 = document.createElement('button');
    b1.type = 'button';
    b1.className = 'tbtn';
    b1.textContent = 'コピー';
    b1.title = name + 'の表をタブ区切りでコピーします。Excel やスプレッドシートにそのまま貼れます。' + hint;
    b1.setAttribute('aria-label', name + 'の表をコピー');
    b1.addEventListener('click', function () { copy(toTSV(build(el)), b1); });

    var b2 = document.createElement('button');
    b2.type = 'button';
    b2.className = 'tbtn';
    b2.textContent = 'CSV';
    b2.title = name + 'の表を CSV ファイルとして保存します。' + hint;
    b2.setAttribute('aria-label', name + 'の表を CSV で保存');
    b2.addEventListener('click', function () { download(toCSV(build(el)), fileName(name)); });

    d.appendChild(b1);
    d.appendChild(b2);
    return d;
  }

  // ボタンは HTML に埋め込まず JS で差し込む。JS が動かない環境で
  // 押しても何も起きないボタンが残るのを避けるため。
  function tables() {
    TABLES.forEach(function (spec) {
      Array.prototype.forEach.call(document.querySelectorAll(spec[0]), function (el) {
        var anchor = spec[3] ? (el.closest(spec[3]) || el) : el;
        anchor.parentNode.insertBefore(bar(spec[1], spec[2], el, spec[4]), anchor);
      });
    });
  }

  // 例外は握り潰さずコンソールに出す。1つの機能が落ちても他は動かしたいので
  // 個別に囲うが、黙って消すと地図が真っ白でも気づけない。
  function run(name, fn) {
    try { fn(); } catch (e) { console.error('[tide] ' + name + ' failed:', e); }
  }

  function init() {
    run('currentTide', currentTide);
    run('graphSwipe', graphSwipe);
    run('maps', maps);
    run('thresholdMode', thresholdMode);
    run('recordRecent', recordRecent);
    run('searchModal', searchModal);
    run('tables', tables);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Leaflet は defer で後から来るので、読み込み完了後にもう一度試す
  window.addEventListener('load', function () { run('maps', maps); });
})();
