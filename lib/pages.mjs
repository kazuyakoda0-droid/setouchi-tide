// =====================================================================
// ページテンプレート
//
// title / description には必ずその地点・その日の実数値を入れる。
// 「広島の潮見表」だけのタイトルが760枚並ぶと互いに共食いするため、
// 満潮時刻・干潮時刻・干満差といった一意な数字で差をつける。
// =====================================================================

import { SITE, url, asset, absUrl } from '../config.mjs';
import { page, esc, attr, ad, pager, viewTabs, section, waveMark } from './html.mjs';
import {
  tideGraph, extremeTable, flowBlock, tideGrid, sunMoon, weatherBlock,
  shioBadge, weekTable, monthCalendar, stationList, coords, nowBox,
} from './components.mjs';
import { fmtHM, WD, pad2, weekdayColor, addDays, dayKeyOf } from './util.mjs';
import { paths, abs, pref, region, regionOf, prefStations, regionPrefs, regionStationCount, stationSlug, uniqueName } from './routes.mjs';
import { movingWindows } from './tide.mjs';
import { isCoastSupplement, stationLabel, stationMarkerClass, stationMarkerLabel, stationQuality } from './station-quality.mjs';

const SEP = '｜';

function trailFor(st, extra) {
  const p = pref(st.pref), r = regionOf(st);
  const t = [
    { name: '全国', href: paths.home(), abs: abs.home() },
    { name: r.name, href: paths.region(r), abs: abs.region(r) },
    { name: p.name, href: paths.pref(p), abs: abs.pref(p) },
    { name: stationLabel(st), href: paths.station(st), abs: abs.station(st) },
  ];
  if (extra) t.push(extra);
  return t;
}

// 「最近見た地点」用。app.js がページ読込時にこれを localStorage に積む。
function recentOf(st) {
  return { n: stationLabel(st), h: paths.station(st), p: pref(st.pref).name };
}

function mapStation(st, current = false) {
  return { n: stationLabel(st), la: st.lat, lo: st.lon, h: paths.station(st), m: stationMarkerClass(st), c: current ? 1 : 0 };
}

function srcNote(st) {
  if (!st.jmaAnchor) {
    // 表示名と験潮所名が違う地点(例: 下関 ⇔ 弟子待)は、どの観測点の値かを明示する。
    const gauge = st.jmaName && st.jmaName !== st.name
      ? `気象庁での験潮所名は<b>${esc(st.jmaName)}</b>です。` : '';
    return `<p class="src-note">この地点は気象庁の公式潮位観測点です。表示している潮位は気象庁の推算値そのものです。${gauge}</p>`;
  }
  const adj = (st.damp !== 1 || st.dz !== 0)
    ? `振幅 ${st.damp.toFixed(2)}倍・基準面 ${st.dz >= 0 ? '+' : ''}${st.dz}cm の補正を掛けています。`
    : `補正は掛けず、観測点の値をそのまま表示しています。`;
  const dist = st.jmaKm != null
    ? `（約${st.jmaKm < 1 ? '1km未満' : Math.round(st.jmaKm) + 'km'}）` : '';
  const coastSupplement = isCoastSupplement(st);
  const osm = st.id.startsWith('n') && !coastSupplement
    ? `地点の位置情報は<a href="https://www.openstreetmap.org/copyright" rel="noopener" target="_blank">OpenStreetMap</a>のデータを参照しています。` : '';
  const coast = coastSupplement
    ? '地点は沿岸形状から補完しています。港名を推測した地点ではありません。' : '';
  const quality = stationQuality(st);
  const qualityNote = quality === 'low'
    ? `参照点が遠い、または海域差が大きい可能性があるため、<b>△参考地点</b>として表示しています。現地の潮見表・海況と必ず併用してください。`
    : `既存の潮汐差・距離の安全基準を満たした<b>○精度確認済み近似地点</b>です。`;
  return `<p class="src-note">この地点には公式観測点がないため、最寄りの気象庁観測点<b>${esc(st.jmaName || st.jma)}</b>${dist}の推算値を参照しています。${adj}${qualityNote}${coast}${osm}</p>`;
}

// 気象庁「潮位観測情報」による実測との偏差(速報値)。st.deviationは
// build.mjsが該当観測点だけに一度だけ計算して載せている
// ({deviationCm, obsCm, astroCm, hh, mm} または未対応地点はnull)。
function deviationNote(st) {
  const dv = st.deviation;
  if (!dv) return '';
  const sign = dv.deviationCm > 0 ? '+' : '';
  const dir = dv.deviationCm > 0 ? '高く' : dv.deviationCm < 0 ? '低く' : '同じ高さで';
  const diff = dv.deviationCm === 0 ? '' : `<b>${sign}${dv.deviationCm}cm</b> `;
  return `<p class="dev-note">気象庁「潮位観測情報」によると、実測潮位は天文潮位より${diff}${dir}なっています（${pad2(dv.hh)}:${pad2(dv.mm)}時点・速報値）。</p>`;
}

// description には必ず県名を入れる（「広島県広島の…」）。
// uniqueName が同名対策で既に県名から始まる地点は重ねない。
function displayName(st) {
  return isCoastSupplement(st) ? stationLabel(st) : uniqueName(st);
}

function withPref(st) {
  const p = pref(st.pref), n = displayName(st);
  return n.startsWith(p.name) ? n : p.name + n;
}

// h1 直下に置く要約段落。検索結果・AI要約への引用を想定し、満潮/干潮の
// 時刻や潮回りなど description と同じ内容を、可視の本文として書く。
// 数値は data- 属性やテーブルのセルにしか無いと、静的HTMLしか読まない
// クローラや生成AIには実質「答えが書かれていない」ページに見えるため。
function lead(text) {
  return `<p class="lead">${text}</p>`;
}

function flowText(ws) {
  if (!ws.length) return '';
  return `潮がよく動くのは${ws.slice(0, 2).map(w => `${w.fromStr}〜${w.toStr}`).join('と')}です。`;
}

function extremeSummary(day) {
  const h = day.highs.map(e => fmtHM(e.time)).join('・');
  const l = day.lows.map(e => fmtHM(e.time)).join('・');
  return { h: h || '—', l: l || '—' };
}

// ---------------------------------------------------------------------
// 地点ハブの主役ブロック（PC = 左に地図・右に潮汐、スマホ = 潮汐が先）
//
// DOM は「潮汐(数字→グラフ) → 地図」の順に置き、PC でだけ CSS の order で
// 地図を左へ回す。スマホでスクロールして最初に出るべきなのは満潮・干潮の
// 数字とタイドグラフであって地図ではないため。読み上げと検索エンジンに
// 渡る順序もこちらが正しい。
//
// 地図に載せるのは自分と近隣地点。近隣はクリックでその地点へ飛べるので、
// 「近くの地点」リストと同じ内部リンクを地図側からも張ることになる。
// ---------------------------------------------------------------------
function splitBlock(st, day, cel, neighbors, dayMs) {
  const pts = [
    mapStation(st, true),
    ...neighbors.map(x => mapStation(x.st)),
  ];
  return `<div class="split">
  <div class="split-info">
    ${nowBox(day)}
    ${deviationNote(st)}
    <div class="stats">
      <div><span class="k">最高潮位</span><b>${day.max}<small>cm</small></b></div>
      <div><span class="k">最低潮位</span><b>${day.min}<small>cm</small></b></div>
      <div><span class="k">干満差</span><b>${day.range}<small>cm</small></b></div>
    </div>
    ${extremeTable(day)}
    ${tideGraph(day, cel, {
      current: `${new Date(dayMs).getUTCMonth() + 1}/${new Date(dayMs).getUTCDate()} ${WD[cel.wd]}`,
      prev: { href: paths.day(st, dayKeyOf(addDays(dayMs, -1))), label: '前日' },
      next: { href: paths.day(st, dayKeyOf(addDays(dayMs, 1))), label: '翌日' },
    })}
  </div>
  <div class="split-map">
    <div class="map" data-map data-fit-max="12" data-stations="${attr(JSON.stringify(pts))}"></div>
    <p class="note">濃い点がこの地点、薄い点が近くの地点です。点をクリックするとその地点の潮見表に移ります。</p>
  </div>
</div>`;
}

// ---------------------------------------------------------------------
// 近隣の釣果情報（外部サイトへのリンクのみ。自前ではデータを持たない）
//
// X (旧Twitter) の検索APIは有料化されており、投稿の取得・埋め込みはできない。
// 代わりに検索結果ページへのディープリンクを置く。アングラーズは県単位の
// URLパターンが確認できている(/prefectures/{都道府県コード})一方、
// 地点名でのキーワード検索は完全一致しないことがあるため、
// 確実に内容のある県ページへのリンクにとどめる。
//
// 広島県のみ先行実装（config.mjs のような全県対応は都道府県コードの
// 対応表が要るため、需要を見てから広げる）。
// ---------------------------------------------------------------------
const ANGLERS_PREF_CODE = {
  hokkaido:1, aomori:2, iwate:3, miyagi:4, akita:5, yamagata:6, fukushima:7,
  ibaraki:8, chiba:12, tokyo:13, kanagawa:14, niigata:15, toyama:16, ishikawa:17,
  fukui:18, shizuoka:22, aichi:23, mie:24, kyoto:26, osaka:27, hyogo:28,
  okayama:33, hiroshima:34, yamaguchi:35, tokushima:36, kagawa:37, ehime:38,
  kochi:39, fukuoka:40, saga:41, nagasaki:42, kumamoto:43, oita:44, miyazaki:45,
  kagoshima:46, okinawa:47,
};

// X は地点名だけだと同名の港や一般語まで拾いやすい。広島県では、
// 実際に釣行先として一緒に語られやすい海域名を地域ごとに足す。
// 他県を展開するときも、この関数へ語群を追加すれば同じ導線を使える。
function fishingSearchFor(st) {
  // 各地点から最も近い二地点も検索語に加える。港名だけの検索より投稿を拾いやすく、
  // 県単位への展開でも個別の語群メンテナンスを必要としない。
  const coastSupplement = isCoastSupplement(st);
  const near = prefStations(st.pref)
    .filter(s => s.id !== st.id && !isCoastSupplement(s))
    .sort((a, b) => (a.lat - st.lat) ** 2 + (a.lon - st.lon) ** 2 - ((b.lat - st.lat) ** 2 + (b.lon - st.lon) ** 2))
    .slice(0, coastSupplement ? 3 : 2)
    .map(stationLabel);
  const terms = [...new Set(coastSupplement ? near : [stationLabel(st), ...near])];
  const query = `(${terms.map(t => `"${t}"`).join(' OR ')}) 釣 -filter:replies`;
  return { href: `https://x.com/search?q=${encodeURIComponent(query)}&f=live`, label: `Xで${terms.join('・')}周辺を検索` };
}

function fishingLinksBlock(st) {
  const anglersCode = ANGLERS_PREF_CODE[st.pref];
  const anglersUrl = anglersCode ? `https://anglers.jp/prefectures/${anglersCode}` : '';
  const search = fishingSearchFor(st);
  if (!anglersUrl && !search) return '';
  const p = pref(st.pref);
  return section('近隣の釣果情報', 'FISHING REPORTS', `
<ul class="extlinks">
  ${anglersUrl ? `<li><a href="${attr(anglersUrl)}" rel="nofollow noopener" target="_blank">アングラーズで${esc(p.name)}の釣果を見る<span class="arrow">↗</span></a></li>` : ''}
  ${search ? `<li><a href="${attr(search.href)}" rel="nofollow noopener" target="_blank">${esc(search.label)}<span class="arrow">↗</span></a></li>` : ''}
</ul>
<p class="note">釣り情報は外部サイト・SNS検索によるものです。検索は近隣3地点と「釣」を組み合わせ、地域の投稿を拾いやすくしています。安全確認や漁業権・立入制限は必ず現地の表示と関係者の指示に従ってください。</p>`);
}

// 地点ページ共通のサイド/フッター部品
function relatedBlock(st, neighbors) {
  const p = pref(st.pref), r = regionOf(st);
  const others = prefStations(st.pref).filter(s => s.id !== st.id).slice(0, 40);
  return section('近くの地点', 'NEARBY', `
${stationList(neighbors.map(n => ({
    href: paths.station(n.st), name: stationLabel(n.st), kana: n.st.kana,
    official: !n.st.jmaAnchor, tier: stationMarkerClass(n.st), note: n.km < 1 ? '1km未満' : `約${Math.round(n.km)}km`,
  })), 'near')}
<h3 class="sub">${esc(p.name)}の他の地点</h3>
${stationList(others.map(s => ({
    href: paths.station(s), name: stationLabel(s), kana: s.kana, official: !s.jmaAnchor, tier: stationMarkerClass(s),
  })), 'cols')}
<p class="more"><a href="${attr(paths.pref(p))}">${esc(p.name)}の潮見表 一覧</a>　<a href="${attr(paths.region(r))}">${esc(r.name)}地方の一覧</a></p>`);
}

// ---------------------------------------------------------------------
// 地点ハブ（当日）
// ---------------------------------------------------------------------
export function stationPage(ctx) {
  const { st, day, cel, ymd, dayMs, weekRows, neighbors, fc, noindex } = ctx;
  const p = pref(st.pref);
  const s = extremeSummary(day);
  const d = new Date(dayMs);
  const dateJa = `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;

  const title = `${displayName(st)}の潮見表・タイドグラフ${SEP}今日(${dateJa})の満潮 ${s.h}・干潮 ${s.l}${SEP}${SITE.NAME}`;
  const description = `${withPref(st)}の今日の潮汐。満潮 ${s.h}、干潮 ${s.l}、干満差 ${day.range}cm、${cel.shio}。`
    + `10分毎の潮位・潮がよく動く時間帯・日の出入・月齢を気象庁の公式推算値から掲載しています。`;

  const body = `
<article>
  <header class="st-hd">
    <p class="st-eyebrow"><a href="${attr(paths.pref(p))}">${esc(p.name)}</a></p>
    <h1>${esc(stationLabel(st))}の潮見表・タイドグラフ</h1>
    ${st.kana ? `<p class="kana">${esc(st.kana)}</p>` : ''}
    <p class="meta">${coords(st)}<span class="badge ${stationMarkerClass(st)}">${stationMarkerLabel(st)}</span></p>
  </header>

  ${lead(`${dateJa}（${WD[cel.wd]}）の${withPref(st)}の潮汐は、満潮が${s.h}、干潮が${s.l}です。`
    + `<a href="${attr(paths.guide('oshio-koshio'))}">潮回り</a>は${cel.shio}、干満差は${day.range}cmです。${flowText(movingWindows(day.levels))}`)}

  ${viewTabs([
    { label: '今日', active: true },
    { label: '1週間', href: paths.week(st) },
    { label: '1か月', href: paths.month(st, ymd.slice(0, 7)) },
  ])}

  <div class="daybar">
    <span class="date">${d.getUTCFullYear()}年${dateJa}<span class="wd" style="color:${weekdayColor(cel.wd)}">（${WD[cel.wd]}）</span></span>
    ${shioBadge(cel.shio)}
    <a class="detail" href="${attr(paths.day(st, ymd))}">この日を詳しく</a>
  </div>

  ${splitBlock(st, day, cel, neighbors, dayMs)}

  ${ad('header')}

  ${section('潮がよく動く時間帯', 'TIDAL FLOW', flowBlock(day),
    `<a class="blk-more" href="${attr(paths.guide('ugoku-jikantai'))}">この指標について</a>`)}
  ${ad('graph')}
  ${section('10分毎の潮位', 'TIDE HEIGHTS · 10-MIN · CM', tideGrid(day),
    `<a class="blk-more" href="${attr(paths.guide('mikata'))}">数値の読み方</a>`)}
  ${section('日の出入・月', 'SUN & MOON', sunMoon(cel),
    `<a class="blk-more" href="${attr(paths.guide('jikoku-mainichi-kawaru'))}">時刻が毎日変わる理由</a>`)}
  ${section('気象・海象', 'WEATHER & SEA', weatherBlock(st, ymd, fc))}

  ${section('これからの7日間', '7-DAY', weekTable(weekRows)
    + `<p class="more"><a href="${attr(paths.week(st))}">週間潮見表をひらく</a>　<a href="${attr(paths.month(st, ymd.slice(0, 7)))}">${ymd.slice(0, 4)}年${Number(ymd.slice(5, 7))}月のカレンダー</a></p>`)}

  ${relatedBlock(st, neighbors)}
  ${fishingLinksBlock(st)}
  ${srcNote(st)}
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.station(st),
    fileBase: `${stationLabel(st)}_${ymd}`,
    trail: trailFor(st),
    recentStation: recentOf(st),
    ld: [stationLd(st, day, cel, ymd, ymd)],
    head: leafletHead(),
    scripts: leafletScripts(),
    noindex,
  }, body);
}

// ---------------------------------------------------------------------
// 日別ページ
//
// 地図は載せない。地点ハブと同じものを日別15ページぶん置くと Leaflet を
// 8千ページに配ることになり、内容の追加ぶんに見合わない。場所を知りたい
// ときは同じ地点のハブへ1クリックで戻れる。
// ---------------------------------------------------------------------
export function dayPage(ctx) {
  const { st, day, cel, ymd, dayMs, prev, next, isToday, monthDays, fc, dateModified, noindex } = ctx;
  const p = pref(st.pref);
  const s = extremeSummary(day);
  const d = new Date(dayMs);
  const Y = d.getUTCFullYear(), M = d.getUTCMonth() + 1, D = d.getUTCDate();
  const dateJa = `${Y}年${M}月${D}日`;
  const ws = movingWindows(day.levels);

  const title = `${displayName(st)}の潮見表 ${dateJa}(${WD[cel.wd]})${SEP}満潮 ${s.h} 干潮 ${s.l}${SEP}${SITE.NAME}`;
  const description = `${withPref(st)}の${dateJa}の潮汐。満潮 ${s.h}、干潮 ${s.l}、干満差 ${day.range}cm、${cel.shio}、月齢 ${cel.age.toFixed(1)}。`
    + (ws.length ? `潮がよく動くのは ${ws.map(w => w.fromStr + '〜' + w.toStr).slice(0, 2).join('と')}。` : '')
    + `10分毎の潮位を気象庁の公式推算値から掲載。`;

  const body = `
<article>
  <header class="st-hd">
    <p class="st-eyebrow"><a href="${attr(paths.pref(p))}">${esc(p.name)}</a>　<a href="${attr(paths.station(st))}">${esc(stationLabel(st))}</a></p>
    <h1>${esc(stationLabel(st))}の潮見表　${dateJa}<span class="wd" style="color:${weekdayColor(cel.wd)}">（${WD[cel.wd]}）</span></h1>
    <p class="meta">${shioBadge(cel.shio)}${isToday ? '<span class="badge today">今日</span>' : ''}<span class="badge ${stationMarkerClass(st)}">${stationMarkerLabel(st)}</span></p>
  </header>

  ${lead(`${dateJa}（${WD[cel.wd]}）の${withPref(st)}の潮汐は、満潮が${s.h}、干潮が${s.l}です。`
    + `<a href="${attr(paths.guide('oshio-koshio'))}">潮回り</a>は${cel.shio}、干満差は${day.range}cm、月齢は${cel.age.toFixed(1)}です。${flowText(ws)}`)}

  ${viewTabs([
    { label: '1日', active: true },
    { label: '1週間', href: paths.week(st) },
    { label: '1か月', href: paths.month(st, ymd.slice(0, 7)) },
  ])}

  ${pager(
    prev ? { href: prev.href, label: '‹ ' + prev.label } : null,
    `${M}/${D}`,
    next ? { href: next.href, label: next.label + ' ›' } : null,
  )}

  ${isToday ? nowBox(day) : ''}

  <div class="stats">
    <div><span class="k">最高潮位</span><b>${day.max}<small>cm</small></b></div>
    <div><span class="k">最低潮位</span><b>${day.min}<small>cm</small></b></div>
    <div><span class="k">干満差</span><b>${day.range}<small>cm</small></b></div>
    <div><span class="k">月齢</span><b>${cel.age.toFixed(1)}</b></div>
  </div>

  ${tideGraph(day, cel, {
    current: `${M}/${D} ${WD[cel.wd]}`,
    prev: prev ? { href: prev.href, label: '前日' } : null,
    next: next ? { href: next.href, label: '翌日' } : null,
  })}
  ${extremeTable(day)}
  ${ad('header')}

  ${section('潮がよく動く時間帯', 'TIDAL FLOW', flowBlock(day),
    `<a class="blk-more" href="${attr(paths.guide('ugoku-jikantai'))}">この指標について</a>`)}
  ${section('10分毎の潮位', 'TIDE HEIGHTS · 10-MIN · CM', tideGrid(day),
    `<a class="blk-more" href="${attr(paths.guide('mikata'))}">数値の読み方</a>`)}
  ${ad('graph')}
  ${section('日の出入・月', 'SUN & MOON', sunMoon(cel),
    `<a class="blk-more" href="${attr(paths.guide('jikoku-mainichi-kawaru'))}">時刻が毎日変わる理由</a>`)}
  ${section('気象・海象', 'WEATHER & SEA', weatherBlock(st, ymd, fc))}

  ${section(`${Y}年${M}月の他の日`, 'THIS MONTH', `<ul class="daylinks">${monthDays.map(m =>
    m.href
      ? `<li${m.ymd === ymd ? ' class="on"' : ''}><a href="${attr(m.href)}">${m.d}</a></li>`
      : `<li class="off"><span>${m.d}</span></li>`).join('')}</ul>
    <p class="more"><a href="${attr(paths.month(st, ymd.slice(0, 7)))}">${Y}年${M}月のカレンダーを見る</a>
    <span class="note-inline">灰色の日は個別ページを用意していません。カレンダーで満潮・干潮を確認できます。</span></p>`)}

  ${srcNote(st)}
  <p class="more"><a href="${attr(paths.station(st))}">${esc(stationLabel(st))}の潮見表トップへ</a></p>
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    // 今日の日付ページは地点ハブと内容が重なるので、常設URLである
    // ハブ側に集約する。過去日・未来日は自分自身を正とする。
    canonical: isToday ? abs.station(st) : abs.day(st, ymd),
    fileBase: `${stationLabel(st)}_${ymd}`,
    trail: trailFor(st, { name: `${M}月${D}日`, href: paths.day(st, ymd), abs: abs.day(st, ymd) }),
    recentStation: recentOf(st),
    ld: [stationLd(st, day, cel, ymd, dateModified)],
    noindex,
  }, body);
}

// ---------------------------------------------------------------------
// 週間ページ
// ---------------------------------------------------------------------
export function weekPage(ctx) {
  const { st, rows, ymd, noindex } = ctx;
  const p = pref(st.pref);
  const first = rows[0], last = rows[rows.length - 1];
  const fd = new Date(first.dayMs), ld = new Date(last.dayMs);
  const span = `${fd.getUTCMonth() + 1}月${fd.getUTCDate()}日〜${ld.getUTCMonth() + 1}月${ld.getUTCDate()}日`;
  const shios = [...new Set(rows.map(r => r.cel.shio))].join('・');
  const withRange = rows.filter(r => r.day);
  const maxRow = withRange.reduce((a, b) => (!a || b.day.range > a.day.range ? b : a), null);
  const maxRowJa = maxRow ? `${new Date(maxRow.dayMs).getUTCMonth() + 1}月${new Date(maxRow.dayMs).getUTCDate()}日` : '';

  const title = `${displayName(st)}の週間潮見表${SEP}${span}の満潮・干潮時刻${SEP}${SITE.NAME}`;
  const description = `${withPref(st)}の${span}の潮汐一覧。${shios}。各日の満潮・干潮の時刻と潮位、月齢を気象庁の公式推算値から掲載しています。`;

  const body = `
<article>
  <header class="st-hd">
    <p class="st-eyebrow"><a href="${attr(paths.pref(p))}">${esc(p.name)}</a>　<a href="${attr(paths.station(st))}">${esc(stationLabel(st))}</a></p>
    <h1>${esc(stationLabel(st))}の週間潮見表</h1>
    <p class="meta">${esc(span)}</p>
  </header>

  ${lead(`${span}の${withPref(st)}の潮汐は${shios}です。`
    + (maxRow ? `この期間で干満差が最も大きいのは${maxRowJa}で、${maxRow.day.range}cmです。` : ''))}

  ${viewTabs([
    { label: '今日', href: paths.station(st) },
    { label: '1週間', active: true },
    { label: '1か月', href: paths.month(st, ymd.slice(0, 7)) },
  ])}
  ${weekTable(rows, true)}
  ${ad('header')}
  <p class="more">日付をクリックすると、その日の10分毎の潮位とタイドグラフが開きます。「潮がよく動く時間帯」は<a href="${attr(paths.guide('ugoku-jikantai'))}">この指標について</a>で解説しています。</p>
  ${srcNote(st)}
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.week(st),
    fileBase: `${stationLabel(st)}_週間`,
    trail: trailFor(st, { name: '週間', href: paths.week(st), abs: abs.week(st) }),
    recentStation: recentOf(st),
    noindex,
  }, body);
}

// ---------------------------------------------------------------------
// 月間ページ
// ---------------------------------------------------------------------
export function monthPage(ctx) {
  const { st, ym, cells, prev, next, months, stats, noindex } = ctx;
  const p = pref(st.pref);
  const [Y, M] = ym.split('-').map(Number);

  const title = `${displayName(st)}の潮見表 ${Y}年${M}月${SEP}1か月の満潮・干潮カレンダー${SEP}${SITE.NAME}`;
  const description = `${withPref(st)}の${Y}年${M}月の潮汐カレンダー。大潮は${stats.ohshio}日、`
    + `月内の最大干満差は${stats.maxRange}cm（${stats.maxRangeDay}日）。各日の満潮・干潮の時刻と潮位を気象庁の公式推算値から掲載しています。`;

  const body = `
<article>
  <header class="st-hd">
    <p class="st-eyebrow"><a href="${attr(paths.pref(p))}">${esc(p.name)}</a>　<a href="${attr(paths.station(st))}">${esc(stationLabel(st))}</a></p>
    <h1>${esc(stationLabel(st))}の潮見表　${Y}年${M}月</h1>
  </header>

  ${lead(`${Y}年${M}月の${withPref(st)}の潮汐は、大潮が${stats.ohshio}日あります。`
    + `月内で最も干満差が大きいのは${stats.maxRangeDay}日で、${stats.maxRange}cmです。`)}

  ${viewTabs([
    { label: '今日', href: paths.station(st) },
    { label: '1週間', href: paths.week(st) },
    { label: '1か月', active: true },
  ])}
  <nav class="month-strip" aria-label="月を選択">${months.map(m => m.active
    ? `<span class="month-chip on"><small>${m.year}年</small>${m.month}月</span>`
    : `<a class="month-chip" href="${attr(m.href)}"><small>${m.year}年</small>${m.month}月</a>`).join('')}</nav>
  ${pager(
    prev ? { href: prev.href, label: '‹ ' + prev.label } : null,
    `${Y}年${M}月`,
    next ? { href: next.href, label: next.label + ' ›' } : null,
  )}
  ${monthCalendar(cells)}
  <p class="note">上向きの青いアイコン＝満潮、下向きの茶色いアイコン＝干潮。数値は潮位(cm)。日付をクリックするとその日の10分毎の潮位が開きます。</p>
  ${ad('header')}
  ${srcNote(st)}
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.month(st, ym),
    fileBase: `${stationLabel(st)}_${ym}`,
    trail: trailFor(st, { name: `${Y}年${M}月`, href: paths.month(st, ym), abs: abs.month(st, ym) }),
    recentStation: recentOf(st),
    noindex,
  }, body);
}

// ---------------------------------------------------------------------
// 都道府県ページ
// ---------------------------------------------------------------------
export function prefPage(ctx) {
  const { p, r, rows, ymd, dateJa } = ctx;
  const official = rows.filter(x => !x.st.jmaAnchor).length;
  const low = rows.filter(x => stationQuality(x.st) === 'low').length;
  const accurateApprox = rows.length - official - low;

  const title = `${p.name}の潮見表・タイドグラフ${SEP}${rows.length}地点の満潮・干潮時刻${SEP}${SITE.NAME}`;
  const description = `${p.name}沿岸${rows.length}地点（公式観測点${official}）の潮汐。${dateJa}の各地点の満潮・干潮時刻と干満差を一覧で掲載。`
    + `気象庁の公式推算値による10分毎の潮位、潮がよく動く時間帯も地点ごとに見られます。`;

  const body = `
<article>
  <header class="st-hd">
    <p class="st-eyebrow"><a href="${attr(paths.region(r))}">${esc(r.name)}地方</a></p>
    <h1>${esc(p.name)}の潮見表・タイドグラフ</h1>
    <p class="meta">${rows.length}地点（●基準点 ${official} / ○近似地点 ${accurateApprox} / △参考地点 ${low}）</p>
  </header>

  ${lead(`${dateJa}の${p.name}沿岸${rows.length}地点の潮見表です。●基準点${official}地点、○精度確認済み近似地点${accurateApprox}地点、△参考地点${low}地点を掲載しています。`)}

  <div class="split pin">
    <div class="split-info">
      ${section(`${dateJa}の${p.name}沿岸`, 'TODAY', `
      <div class="tw"><table class="prefsum">
        <thead><tr><th>地点</th><th>潮名</th><th>満潮 <small>cm</small></th><th>干潮 <small>cm</small></th><th>干満差</th></tr></thead>
        <tbody>${rows.map(x => `<tr>
          <th scope="row"><a href="${attr(paths.station(x.st))}"><span class="dot ${stationMarkerClass(x.st)}"></span>${esc(stationLabel(x.st))}</a></th>
          <td>${shioBadge(x.cel.shio)}</td>
          <td class="hi">${x.day ? x.day.highs.map(e => fmtHM(e.time) + ' <small>' + Math.round(e.level) + '</small>').join('<br>') : '—'}</td>
          <td class="lo">${x.day ? x.day.lows.map(e => fmtHM(e.time) + ' <small>' + Math.round(e.level) + '</small>').join('<br>') : '—'}</td>
          <td class="rg">${x.day ? x.day.range + '<small>cm</small>' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`)}
    </div>
    <div class="split-map">
      ${section('地図から選ぶ', 'MAP', `<div class="map" data-map data-stations="${attr(JSON.stringify(rows.map(x => ({
        ...mapStation(x.st),
      }))))}"></div>
      <p class="note">点をクリックするとその地点の潮見表に移ります。●は気象庁の基準点、○は精度確認済みの近似地点、△は参照点が遠い参考地点です。</p>`)}
    </div>
  </div>
  ${ad('header')}
  <p class="more"><a href="${attr(paths.region(r))}">${esc(r.name)}地方の他の県</a>　<a href="${attr(paths.home())}">全国の一覧</a></p>
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.pref(p),
    fileBase: `${p.name}_${ymd}`,
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: r.name, href: paths.region(r), abs: abs.region(r) },
      { name: p.name, href: paths.pref(p), abs: abs.pref(p) },
    ],
    head: leafletHead(),
    scripts: leafletScripts(),
  }, body);
}

// ---------------------------------------------------------------------
// 地方ページ
// ---------------------------------------------------------------------
export function regionPage(ctx) {
  const { r, prefs, count, allStations } = ctx;
  const title = `${r.name}地方の潮見表・タイドグラフ${SEP}${count}地点${SEP}${SITE.NAME}`;
  const description = `${r.name}地方沿岸${count}地点の潮見表。${prefs.map(p => p.name).join('・')}の満潮・干潮時刻、`
    + `10分毎の潮位、タイドグラフを気象庁の公式推算値から掲載しています。`;

  const body = `
<article>
  <header class="st-hd">
    <h1>${esc(r.name)}地方の潮見表・タイドグラフ</h1>
    <p class="meta">${count}地点</p>
  </header>
  ${prefs.map(p => section(p.name, '', stationList(
    prefStations(p.id).map(s => ({ href: paths.station(s), name: stationLabel(s), kana: s.kana, official: !s.jmaAnchor, tier: stationMarkerClass(s) })), 'cols'),
    `<a class="blk-more" href="${attr(paths.pref(p))}">${esc(p.name)}の一覧</a>`)).join('')}
  ${ad('graph')}
  ${section('地図から選ぶ', 'MAP', `<div class="map" data-map data-stations="${attr(JSON.stringify(allStations.map(s => ({
    ...mapStation(s),
  }))))}"></div>`)}
  <p class="more"><a href="${attr(paths.home())}">全国の一覧へ</a></p>
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.region(r),
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: r.name, href: paths.region(r), abs: abs.region(r) },
    ],
    head: leafletHead(),
    scripts: leafletScripts(),
  }, body);
}

// ---------------------------------------------------------------------
// トップ
// ---------------------------------------------------------------------
export function homePage(ctx) {
  const { regions, total, official, allStations, dateJa, activities } = ctx;
  const low = allStations.filter(s => stationQuality(s) === 'low').length;
  const accurateApprox = total - official - low;
  const title = `${SITE.NAME}${SEP}気象庁公式データによる全国${total}地点の潮見表・タイドグラフ`;
  const description = `全国${total}地点（気象庁公式観測点${official}）の潮見表・タイドグラフ。`
    + `満潮・干潮の時刻と潮位、10分毎の潮位、潮がよく動く時間帯、日の出入・月齢を無料で掲載。${dateJa}現在。`;

  const body = `
<article>
  <header class="home-hd">
    <h1>${waveMark('wmm', 'home-mark')}<span>${esc(SITE.NAME)}<span class="en">${esc(SITE.NAME_EN)}</span></span></h1>
    <p class="lede">${esc(SITE.TAGLINE)}</p>
    <p class="meta">全${total}地点（●基準点 ${official} / ○近似地点 ${accurateApprox} / △参考地点 ${low}）</p>
  </header>
  <div id="areas"></div>
  <div class="split wide-map">
    <div class="split-info">
      ${section('地方から選ぶ', 'AREAS', `<ul class="regions">${regions.map(r =>
        `<li><a href="${attr(paths.region(r.r))}"><span class="rn">${esc(r.r.name)}</span><span class="rc">${r.count}地点</span></a></li>`).join('')}</ul>`)}
    </div>
    <div class="split-map">
      ${section('地図から選ぶ', 'MAP', `<div class="map tall" data-map data-fit="japan" data-stations="${attr(JSON.stringify(allStations.map(s => ({
        ...mapStation(s),
      }))))}"></div>
      <p class="note">全${total}地点。●は気象庁の基準点、○は精度確認済みの近似地点、△は参照点が遠い参考地点です。</p>`)}
    </div>
  </div>
  ${ad('header')}
  ${section('特徴', 'FEATURES', `<ul class="feat">
    <li><b>10分毎の潮位</b>を全地点・全日で掲載しています。満潮・干潮の4点だけでなく、1日144点の潮位が数値で読めます。</li>
    <li><b>潮がよく動く時間帯</b>を潮位の変化速度(cm/h)から算出して表示します。満干潮の時刻より実用的な目安です。</li>
    <li>潮位は<b>気象庁の公式推算値</b>をそのまま表示。公式観測点のない地点は近似であることを地点ごとに明示しています。</li>
  </ul>`)}
  ${ad('graph')}
  ${section('用途から選ぶ', '', `<ul class="guide-list">${activities.map(a =>
    `<li><a href="${attr(paths.activity(a.slug))}">${esc(a.title)}</a><span class="note">${esc(a.tagline)}</span></li>`).join('')}</ul>`)}
  ${ad('footer')}
</article>`;

  return page({
    title, description,
    canonical: abs.home(),
    trail: null,
    ld: [{
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.NAME,
      alternateName: SITE.NAME_EN,
      url: abs.home(),
      description: SITE.TAGLINE,
      inLanguage: 'ja',
    }],
    head: leafletHead(),
    scripts: leafletScripts(),
  }, body);
}

export function aboutPage() {
  const title = `このサイトについて${SEP}${SITE.NAME}`;
  const description = `${SITE.NAME}のデータ出典・計算方法・免責について。潮位も天気も気象庁の公表データによります。`;
  const body = `
<article class="prose">
  <h1>このサイトについて</h1>
  <p>大潮・小潮の仕組みや潮見表の読み方など、基礎的な内容は<a href="${attr(paths.guideIndex())}">潮見表・潮汐のガイド</a>にまとめています。ここではデータの出典や計算方法について説明します。</p>
  <h2>データの出典</h2>
  <p>潮位は<a href="${attr(SITE.JMA_CREDIT_URL)}" rel="nofollow noopener" target="_blank">気象庁 潮位表</a>の公式推算値です。年次の潮位表ファイルを取得し、毎時の推算値を掲載しています。</p>
  <p>10分毎の潮位は、毎時値を三次スプライン（自然境界）で補間したものです。満潮・干潮の時刻と潮位は補間値ではなく、気象庁が公表している値をそのまま使っています。</p>
  <p>天気・風・波・気温・降水確率は<a href="${attr(SITE.JMA_FC_CREDIT_URL)}" rel="nofollow noopener" target="_blank">気象庁 天気予報</a>を加工して作成しています。地点ごとに、同じ都道府県内で最寄りの予報区（一次細分区域）の予報を割り当てています。気温は最寄りのアメダス地点の値で、3日先以降は都道府県の代表地点の値になります。どの地点の値かは各ページに書いています。</p>
  <p>今日・明日・明後日は短期予報、3日先から7日先までは週間予報にもとづいています。週間予報の天気と降水確率は都道府県単位でしか発表されないため、県内のどの地点でも同じ値になります。気象庁の天気予報は7日先までなので、それより先の日と過去の日には天気を表示していません（潮位は推算値なので通年で表示されます）。</p>
  <p>天気予報は1日1回、サイトを再生成するときに取得しています。各ページに気象庁の発表時刻を書いているのはこのためで、閲覧している時点の最新の発表とは異なる場合があります。最新の予報は<a href="${attr(SITE.JMA_FC_CREDIT_URL)}" rel="nofollow noopener" target="_blank">気象庁のページ</a>で確認してください。</p>
  <h2>公式観測点と近似地点</h2>
  <p>気象庁の潮位観測点がある地点は「公式観測点」として、推算値をそのまま表示しています。</p>
  <p>観測点のない港などは「近似地点」として、最寄りの観測点の値を参照しています。最寄り観測点の割り当ては、半島を挟んだ反対側の観測点と結びつく事故を避けるため、半径25km内にある観測点の干満差のばらつきが25%以内である場所に限っています。どの観測点を参照しても値が変わらない場所だけを残した、ということです。</p>
  <h2>潮がよく動く時間帯について</h2>
  <p>10分毎の潮位を微分して変化速度(cm/h)を求め、その日の最大変化速度の60%を超える連続区間を抜き出しています。閾値をその日・その地点の最大値に対する比率としているのは、干満差が30cmの日本海側と400cmの瀬戸内で同じ絶対値の閾値が使えないためです。この指標の使い方は<a href="${attr(paths.guide('ugoku-jikantai'))}">潮がよく動く時間帯とは</a>で解説しています。</p>
  <h2>表の書き出しについて</h2>
  <p>満潮・干潮の一覧、10分毎の潮位、週間表、月間カレンダー、都道府県の地点別一覧には、それぞれ右上に「コピー」「CSV」のボタンが付いています。「コピー」はタブ区切りでクリップボードに入るので、Excel やスプレッドシートのセルにそのまま貼り付けられます。「CSV」は同じ内容をファイルとして保存します。</p>
  <p>CSV には UTF-8 の BOM を付けています。これが無いと Excel が文字コードを取り違え、地点名や見出しが文字化けするためです。</p>
  <p>満潮・干潮は日によって1日1回のことも3回のこともあるため、セル内に詰め込まず「満潮1時刻・満潮1潮位cm・満潮2時刻…」と列に開いて書き出しています。10分毎の潮位は、画面では24行×6列の表ですが、書き出しでは1行1時刻（日付・時刻・潮位cm）にしています。この形でないとグラフや関数にかけられないためです。</p>
  <p>書き出したデータの元は気象庁の推算値です。再配布・二次利用の際は出典を明記してください。</p>
  <h2>簡易API(JSON)</h2>
  <p>各地点のデータを <code>/api/{都道府県}/{地点名}.json</code> というURLでも配信しています。地点ページのURL（例: <code>/hiroshima/中浜港/</code>）の <code>hiroshima/中浜港</code> の部分がそのまま <code>都道府県/地点名</code> に対応するので、末尾を <code>.json</code> に変えるだけでアクセスできます。クエリパラメータは受け付けず、当サイトが生成しているのと同じ日数ぶん（今日を含む前後の日付。今日だけ10分毎の潮位も含みます）を1ファイルにまとめて返します。認証やレート制限は設けていませんが、更新はサイト全体のビルドと同じく1日1回です。</p>

  <h2>広告とプライバシー</h2>
  <p>当サイトの広告配信と Cookie の取り扱いについては<a href="${attr(url('privacy'))}">プライバシーポリシー</a>をご覧ください。</p>
  <h2>運営者</h2>
  <p>${esc(SITE.OPERATOR_NAME)}が個人で企画・開発・運営しています。</p>
  ${SITE.CONTACT_URL ? `<h2>お問い合わせ</h2>
  <p>データの誤りのご指摘、掲載内容についてのご連絡は<a href="${attr(SITE.CONTACT_URL)}" rel="nofollow noopener" target="_blank">お問い合わせフォーム</a>からお願いします。</p>
` : ''}  <h2>免責</h2>
  <p>掲載している潮位は推算値であり、実測値とは異なります。気圧・風・河川流入などの影響で実際の潮位は上下します。航行・遊泳・釣行などの安全に関わる判断は、必ず現地の状況と公的機関が発表する情報にもとづいて行ってください。当サイトの情報の利用によって生じた損害について、運営者は責任を負いません。</p>
</article>`;
  return page({
    title, description,
    canonical: absUrl('about'),
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: 'このサイトについて', href: url('about'), abs: absUrl('about') },
    ],
  }, body);
}

// AdSense のポリシーは、第三者配信事業者による Cookie 使用とオプトアウト手段の
// 明示を求めている。ADSENSE_CLIENT が空で広告を出していないあいだも、審査に
// 出す時点でこのページが存在している必要があるため、常に出力する。
export function privacyPage() {
  const title = `プライバシーポリシー${SEP}${SITE.NAME}`;
  const description = `${SITE.NAME}における広告配信・Cookie・アクセス解析の取り扱いについて。`;
  const body = `
<article class="prose">
  <h1>プライバシーポリシー</h1>
  <h2>運営者</h2>
  <p>当サイトは${esc(SITE.OPERATOR_NAME)}が個人で運営しています。</p>
  <h2>広告の配信について</h2>
  <p>当サイトでは、第三者配信の広告サービス（Google AdSense）による広告を掲載します。</p>
  <p>Google などの第三者配信事業者は、Cookie を使用して、利用者が当サイトや他のサイトに過去にアクセスした際の情報にもとづいて広告を配信します。詳しくは<a href="https://policies.google.com/technologies/ads" rel="nofollow noopener" target="_blank">広告 – ポリシーと規約 – Google</a>をご覧ください。</p>
  <p>パーソナライズ広告は<a href="https://myadcenter.google.com/" rel="nofollow noopener" target="_blank">Google の広告設定</a>で無効にできます。第三者配信事業者の Cookie は<a href="https://www.aboutads.info/choices/" rel="nofollow noopener" target="_blank">aboutads.info</a>から無効にできます。</p>
  <p>当サイトが Cookie を通じて個人を特定できる情報を取得することはありません。</p>
${SITE.GA_ID ? `  <h2>アクセス解析</h2>
  <p>当サイトは、アクセス状況を把握するために Google アナリティクスを利用しています。Google アナリティクスは Cookie を使用してトラフィックデータを収集しますが、収集されるデータは匿名であり、個人を特定するものではありません。</p>
  <p>収集を停止したい場合は、ブラウザの Cookie 設定、または<a href="https://tools.google.com/dlpage/gaoptout" rel="nofollow noopener" target="_blank">Google アナリティクス オプトアウト アドオン</a>から行えます。</p>
` : ''}  <h2>アクセスログ</h2>
  <p>当サイトは GitHub Pages 上の静的なファイルとして配信されており、当サイトの運営者が閲覧者のアクセスログを取得・保存することはありません。</p>
  <h2>掲載内容の免責</h2>
  <p>掲載しているデータの出典と免責については<a href="${attr(url('about'))}">このサイトについて</a>に記載しています。</p>
${SITE.CONTACT_URL ? `  <h2>お問い合わせ</h2>
  <p>本ポリシーに関するお問い合わせは<a href="${attr(SITE.CONTACT_URL)}" rel="nofollow noopener" target="_blank">お問い合わせフォーム</a>からお願いします。</p>
` : ''}  <h2>改定</h2>
  <p>本ポリシーの内容は、必要に応じて予告なく変更することがあります。</p>
</article>`;
  return page({
    title, description,
    canonical: absUrl('privacy'),
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: 'プライバシーポリシー', href: url('privacy'), abs: absUrl('privacy') },
    ],
  }, body);
}

// ---------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------
function leafletHead() {
  return `<link rel="stylesheet" href="${attr(asset('vendor/leaflet/leaflet.css'))}">`;
}
function leafletScripts() {
  return `<script src="${attr(asset('vendor/leaflet/leaflet.js'))}" defer></script>`;
}

// ymd: このページが扱う日(YYYY-MM-DD)。dateModified はページ本文の lastmod と
// 揃える(過去日・予報の無い未来日は静的な推算値だけなのでその日自体、
// 予報がある日は毎日天気欄が更新されるので呼び出し側で today を渡す)。
function stationLd(st, day, cel, ymd, dateModified) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${stationLabel(st)}の潮位推算値`,
    description: `${stationLabel(st)}（${pref(st.pref).name}）の10分毎の潮位、満潮・干潮の時刻と潮位。`,
    creator: { '@type': 'Organization', name: '気象庁' },
    publisher: {
      '@type': 'Organization', name: SITE.NAME, url: abs.home(),
      founder: { '@type': 'Person', name: SITE.OPERATOR_NAME },
    },
    isAccessibleForFree: true,
    license: SITE.JMA_CREDIT_URL,
    temporalCoverage: ymd,
    dateModified,
    spatialCoverage: {
      '@type': 'Place',
      name: stationLabel(st),
      containedInPlace: { '@type': 'AdministrativeArea', name: pref(st.pref).name },
      geo: { '@type': 'GeoCoordinates', latitude: st.lat, longitude: st.lon },
    },
    variableMeasured: [
      { '@type': 'PropertyValue', name: '最高潮位', value: day.max, unitCode: 'CMT' },
      { '@type': 'PropertyValue', name: '最低潮位', value: day.min, unitCode: 'CMT' },
      { '@type': 'PropertyValue', name: '干満差', value: day.range, unitCode: 'CMT' },
    ],
  };
}
