// =====================================================================
// 静的サイトのビルド
//
//   node build.mjs            全ページ生成
//   node build.mjs --sample   1県ぶんだけ生成（動作確認用・数秒で終わる）
//
// 生成物は dist/ に出る。リポジトリにはコミットせず、GitHub Actions が
// Pages の artifact として直接アップロードする。
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE, url, absUrl } from './config.mjs';
import { TIDE_STATIONS, REGIONS, PREFS, JMA_STN_NAME } from './lib/stations.mjs';
import { loadYears } from './lib/jma.mjs';
import { loadForecast } from './lib/forecast.mjs';
import { tideDay, tideDayLight } from './lib/tide.mjs';
import { celestialData } from './lib/astro.mjs';
import {
  todayJSTMs, dayKeyOf, monthKeyOf, dayMsOf, addDays, addMonths,
  daysInMonth, pad2, DAY,
} from './lib/util.mjs';
import { paths, pref, region, regionOf, prefStations, regionPrefs, regionStationCount, stationSlug, validateStations } from './lib/routes.mjs';
import {
  stationPage, dayPage, weekPage, monthPage, prefPage, regionPage, homePage, aboutPage,
  privacyPage,
} from './lib/pages.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const SAMPLE = process.argv.includes('--sample');

// ---------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------
let written = 0;
const allUrls = [];
const seenUrls = new Set();

function write(u, html, { sitemap = true, changefreq = 'daily', priority = 0.6 } = {}) {
  // 同じ URL に2回書くと先に書いたページが黙って消える。生成数とファイル数が
  // ずれるだけなので気づきにくい。ここで落とす。
  if (seenUrls.has(u)) throw new Error(`URL が重複しています: ${u}`);
  seenUrls.add(u);

  const rel = u.startsWith(SITE.BASE) ? u.slice(SITE.BASE.length) : u;
  const dir = path.join(DIST, rel.replace(/^\/+|\/+$/g, ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  written++;
  if (sitemap) allUrls.push({ loc: SITE.ORIGIN + encodePath(u), changefreq, priority });
}

// 日本語セグメントを含むパスを sitemap / canonical 用に percent-encode する
function encodePath(u) {
  return u.split('/').map(encodeURIComponent).join('/');
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

// ---------------------------------------------------------------------
// 距離（近隣地点の算出）
// ---------------------------------------------------------------------
function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function neighborsOf(st, pool, n = 6) {
  return pool
    .filter(s => s.id !== st.id)
    .map(s => ({ st: s, km: km(st, s) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

// ---------------------------------------------------------------------
// 生成対象の日付
// ---------------------------------------------------------------------
const today = todayJSTMs();
const todayKey = dayKeyOf(today);

const dayList = [];
for (let i = -SITE.DAYS_BACK; i <= SITE.DAYS_FWD; i++) dayList.push(addDays(today, i));

// 日別ページを作る日。月カレンダーや日リンクは、この集合にある日だけ
// リンクにする。存在しないページへ張ると 4万件超のリンク切れになる。
const dayPageKeys = new Set(dayList.map(dayKeyOf));

const weekList = [];
for (let i = 0; i < 7; i++) weekList.push(addDays(today, i));

const monthList = [];
for (let i = -SITE.MONTHS_BACK; i <= SITE.MONTHS_FWD; i++) monthList.push(addMonths(today, i));

// 月カレンダーで必要になる全日を含めた、データ取得が要る日の集合
const neededDays = new Set([...dayList, ...weekList].map(dayKeyOf));
for (const m of monthList) {
  const d = new Date(m);
  const n = daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  for (let i = 0; i < n; i++) neededDays.add(dayKeyOf(addDays(m, i)));
}
// 週間表・日別ページの前後リンク用に少し外側も持っておく
neededDays.add(dayKeyOf(addDays(today, SITE.DAYS_FWD + 1)));
neededDays.add(dayKeyOf(addDays(today, -SITE.DAYS_BACK - 1)));

const years = [...new Set([...neededDays].map(k => Number(k.slice(0, 4))))].sort();

// ---------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------
const t0 = Date.now();

validateStations();

const stations = SAMPLE
  ? TIDE_STATIONS.filter(s => s.pref === 'hiroshima')
  : TIDE_STATIONS;

// 観測点名（近似地点の出典表示に使う）
for (const s of TIDE_STATIONS) s.jmaName = JMA_STN_NAME[s.jma] || s.jma;

const codes = [...new Set(stations.map(s => s.jma))];
console.log(`気象庁 潮位表を取得します: ${codes.length}観測点 × ${years.length}年 (${years.join(', ')})`);

const jma = await loadYears(codes, years, {
  onProgress: (d, t) => {
    if (d % 25 === 0 || d === t) process.stdout.write(`\r  ${d}/${t}`);
  },
});
console.log(`\n取得完了 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// 気象庁データが1日も無い観測点は異常なので落とす
for (const c of codes) {
  if (!jma[c] || Object.keys(jma[c]).length < 300) {
    throw new Error(`観測点 ${c} のデータが不足しています (${Object.keys(jma[c] || {}).length}日)`);
  }
}

// ---- 天気予報 -------------------------------------------------------
// 落ちてもサイトは出す。気象欄が空になるだけで、潮汐は独立している。
let forecastFor = () => null;
try {
  const fx = await loadForecast(stations);
  forecastFor = fx.forecastFor;
  console.log(`気象庁 天気予報: ${fx.offices}予報区`
    + (fx.failed.length ? ` (取得失敗 ${fx.failed.length}件: ${fx.failed.join(' / ')})` : '')
    + (fx.unresolved.length ? ` (予報区未割当 ${fx.unresolved.length}地点: ${fx.unresolved.join(', ')})` : ''));
} catch (e) {
  console.warn(`天気予報の取得に失敗しました。気象欄は空になります: ${e.message}`);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
copyDir(path.join(ROOT, 'public'), DIST);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
if (SITE.CNAME) fs.writeFileSync(path.join(DIST, 'CNAME'), SITE.CNAME + '\n');

// ads.txt はドメイン直下に無いと Google に読まれない。BASE が空(apex 運用)
// である前提。審査前に無効な ads.txt を置く意味は無いので、広告タグと同じく
// ADSENSE_CLIENT が空のあいだは出力しない。
if (SITE.ADSENSE_CLIENT) {
  const pub = SITE.ADSENSE_CLIENT.replace(/^ca-/, '');
  fs.writeFileSync(path.join(DIST, 'ads.txt'),
    `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
}

// ---- 地点ページ群 ---------------------------------------------------
const tBuild = Date.now();
let n = 0;

for (const st of stations) {
  const byDay = jma[st.jma];
  const cel = d => celestialData(st, d);
  const light = d => tideDayLight(st, byDay, d);

  // ---- ハブ（当日） ----
  const todayFull = tideDay(st, byDay, today);
  if (!todayFull) throw new Error(`${st.name}: 当日(${todayKey})の潮位データがありません`);

  const weekRows = weekList.map(d => ({
    dayMs: d, ymd: dayKeyOf(d), href: paths.day(st, dayKeyOf(d)),
    cel: cel(d), day: light(d), today: d === today,
  }));

  write(paths.station(st), stationPage({
    st, day: todayFull, cel: cel(today), ymd: todayKey, dayMs: today,
    weekRows,
    neighbors: neighborsOf(st, stations),
    fc: forecastFor(st, todayKey),
  }), { changefreq: 'daily', priority: 0.9 });

  // ---- 週間 ----
  write(paths.week(st), weekPage({ st, rows: weekRows, ymd: todayKey }),
    { changefreq: 'daily', priority: 0.7 });

  // ---- 日別 ----
  for (let i = 0; i < dayList.length; i++) {
    const d = dayList[i];
    const ymd = dayKeyOf(d);
    const full = tideDay(st, byDay, d);
    if (!full) continue;

    const md = new Date(d);
    const monthStart = Date.UTC(md.getUTCFullYear(), md.getUTCMonth(), 1);
    const dim = daysInMonth(md.getUTCFullYear(), md.getUTCMonth());
    const monthDays = [];
    for (let k = 0; k < dim; k++) {
      const dk = dayKeyOf(addDays(monthStart, k));
      monthDays.push({ d: k + 1, ymd: dk, href: dayPageKeys.has(dk) ? paths.day(st, dk) : null });
    }

    // 前後日は「ページを作った日」にだけ張る。潮位データは1年分あるので
    // byDay の有無で判定すると生成範囲の外にリンクしてしまう。
    const pk = dayKeyOf(addDays(d, -1)), nk = dayKeyOf(addDays(d, 1));
    const label = k => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
    write(paths.day(st, ymd), dayPage({
      st, day: full, cel: cel(d), ymd, dayMs: d,
      isToday: d === today,
      prev: dayPageKeys.has(pk) ? { href: paths.day(st, pk), label: label(pk) } : null,
      next: dayPageKeys.has(nk) ? { href: paths.day(st, nk), label: label(nk) } : null,
      monthDays,
      fc: forecastFor(st, ymd),
    }), { changefreq: d === today ? 'daily' : 'monthly', priority: d === today ? 0.5 : 0.4 });
  }

  // ---- 月間 ----
  for (const m of monthList) {
    const md = new Date(m);
    const Y = md.getUTCFullYear(), M0 = md.getUTCMonth();
    const ym = monthKeyOf(m);
    const dim = daysInMonth(Y, M0);
    const firstWd = new Date(Date.UTC(Y, M0, 1)).getUTCDay();

    const cells = new Array(firstWd).fill(null);
    let maxRange = 0, maxRangeDay = 1, ohshio = 0;
    for (let k = 0; k < dim; k++) {
      const dd = addDays(m, k);
      const c = cel(dd), l = light(dd);
      if (l && l.range > maxRange) { maxRange = l.range; maxRangeDay = k + 1; }
      if (c.shio === '大潮') ohshio++;
      const ck = dayKeyOf(dd);
      cells.push({ dayMs: dd, ymd: ck, href: dayPageKeys.has(ck) ? paths.day(st, ck) : null, cel: c, day: l, today: dd === today });
    }
    while (cells.length % 7) cells.push(null);

    const pm = addMonths(m, -1), nm = addMonths(m, 1);
    const inRange = x => monthList.some(v => v === x);
    write(paths.month(st, ym), monthPage({
      st, ym, cells,
      prev: inRange(pm) ? { href: paths.month(st, monthKeyOf(pm)), label: `${new Date(pm).getUTCMonth() + 1}月` } : null,
      next: inRange(nm) ? { href: paths.month(st, monthKeyOf(nm)), label: `${new Date(nm).getUTCMonth() + 1}月` } : null,
      stats: { maxRange, maxRangeDay, ohshio },
    }), { changefreq: 'weekly', priority: 0.5 });
  }

  if (++n % 25 === 0) process.stdout.write(`\r  地点 ${n}/${stations.length}  ページ ${written}`);
}
process.stdout.write(`\r  地点 ${n}/${stations.length}  ページ ${written}\n`);

// ---- 都道府県 -------------------------------------------------------
const td = new Date(today);
const dateJa = `${td.getUTCFullYear()}年${td.getUTCMonth() + 1}月${td.getUTCDate()}日`;
const prefsWithStations = PREFS.filter(p => prefStations(p.id).length
  && (!SAMPLE || p.id === 'hiroshima'));

for (const p of prefsWithStations) {
  const list = prefStations(p.id);
  const rows = list.map(st => ({
    st,
    cel: celestialData(st, today),
    day: tideDayLight(st, jma[st.jma], today),
  }));
  write(paths.pref(p), prefPage({ p, r: region(p.region), rows, ymd: todayKey, dateJa }),
    { changefreq: 'daily', priority: 0.8 });
}

// ---- 地方 -----------------------------------------------------------
const regionsWithStations = REGIONS.filter(r => regionStationCount(r.id) > 0
  && (!SAMPLE || r.id === 'chugoku'));

for (const r of regionsWithStations) {
  const prefs = regionPrefs(r.id).filter(p => !SAMPLE || p.id === 'hiroshima');
  const all = prefs.flatMap(p => prefStations(p.id));
  write(paths.region(r), regionPage({ r, prefs, count: all.length, allStations: all }),
    { changefreq: 'weekly', priority: 0.7 });
}

// ---- トップ・about --------------------------------------------------
write(paths.home(), homePage({
  regions: regionsWithStations.map(r => ({
    r, count: regionStationCount(r.id), prefs: regionPrefs(r.id),
  })),
  total: stations.length,
  official: stations.filter(s => !s.jmaAnchor).length,
  allStations: stations,
  dateJa,
}), { changefreq: 'daily', priority: 1.0 });

write(url('about'), aboutPage(), { changefreq: 'monthly', priority: 0.3 });
write(url('privacy'), privacyPage(), { changefreq: 'monthly', priority: 0.3 });

// ---- sitemap / robots ----------------------------------------------
writeSitemaps();
fs.writeFileSync(path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE.ORIGIN}${SITE.BASE}/sitemap.xml\n`);

function writeSitemaps() {
  const PER = 20000;   // 仕様上限は50,000。余裕を持たせる
  const chunks = [];
  for (let i = 0; i < allUrls.length; i += PER) chunks.push(allUrls.slice(i, i + PER));

  const lastmod = new Date().toISOString().slice(0, 10);
  chunks.forEach((chunk, i) => {
    const body = chunk.map(u =>
      `<url><loc>${u.loc}</loc><lastmod>${lastmod}</lastmod>`
      + `<changefreq>${u.changefreq}</changefreq><priority>${u.priority.toFixed(1)}</priority></url>`).join('\n');
    fs.writeFileSync(path.join(DIST, `sitemap-${i + 1}.xml`),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  });

  const idx = chunks.map((_, i) =>
    `<sitemap><loc>${SITE.ORIGIN}${SITE.BASE}/sitemap-${i + 1}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`).join('\n');
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${idx}\n</sitemapindex>\n`);
}

console.log(`\n生成: ${written} ページ / sitemap ${allUrls.length} URL`);
console.log(`ビルド時間: ${((Date.now() - tBuild) / 1000).toFixed(1)}s (取得込み ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
