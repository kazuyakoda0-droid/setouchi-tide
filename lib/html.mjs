// =====================================================================
// HTML の骨格（<head> の SEO 一式・ヘッダー・フッター・広告枠）
// =====================================================================

import { SITE, url, asset, absUrl } from '../config.mjs';

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function attr(s) { return esc(s); }

// ---------------------------------------------------------------------
// 広告枠
//
// ADSENSE_CLIENT が空のあいだはプレースホルダの div だけを出す。
// 審査前に空の広告タグを置くのはポリシー違反なので、スクリプトも ins も
// 出力しない。CSS 側で .ad:empty を display:none にしてあるため、
// 有効化するまで枠は画面を占有しない。
// ---------------------------------------------------------------------
export function hasSideAd() {
  return !!(SITE.ADSENSE_CLIENT && SITE.ADSENSE_SLOTS.side);
}

export function ad(slotName) {
  const client = SITE.ADSENSE_CLIENT;
  const slot = SITE.ADSENSE_SLOTS[slotName];
  if (!client || !slot) return `<div class="ad ad-${slotName}"></div>`;
  return `<div class="ad ad-${slotName}">`
    + `<ins class="adsbygoogle" style="display:block" data-ad-client="${attr(client)}"`
    + ` data-ad-slot="${attr(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`
    + `<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

function adsenseHead() {
  if (!SITE.ADSENSE_CLIENT) return '';
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=`
    + `${attr(SITE.ADSENSE_CLIENT)}" crossorigin="anonymous"></script>`;
}

function analytics() {
  if (!SITE.GA_ID) return '';
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${attr(SITE.GA_ID)}"></script>`
    + `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}`
    + `gtag('js',new Date());gtag('config','${attr(SITE.GA_ID)}');</script>`;
}

// ---------------------------------------------------------------------
// パンくず（表示用 + JSON-LD 用を同じ配列から作る）
// trail: [{name, href}] の配列。最後の要素は現在地でリンクしない。
// ---------------------------------------------------------------------
export function breadcrumb(trail) {
  const items = trail.map((t, i) => {
    const last = i === trail.length - 1;
    const label = last
      ? `<span aria-current="page">${esc(t.name)}</span>`
      : `<a href="${attr(t.href)}">${esc(t.name)}</a>`;
    return `<li>${label}</li>`;
  }).join('');
  return `<nav class="crumb" aria-label="パンくず"><ol>${items}</ol></nav>`;
}

function breadcrumbLd(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: t.abs,
    })),
  };
}

// ---------------------------------------------------------------------
// ページ全体
//
// opts: { title, description, canonical(絶対URL), trail, ld[], bodyClass,
//         head, scripts, fileBase }
//
// fileBase は表を CSV で保存するときのファイル名の頭。地点名や日付は
// ページ側にしか無く、URL から復元しようとすると BASE パスの有無で
// 壊れるので、素直に body に持たせる。
// ---------------------------------------------------------------------
export function page(opts, body) {
  const ld = [breadcrumbLd(opts.trail || []), ...(opts.ld || [])]
    .filter(x => x && (x['@type'] !== 'BreadcrumbList' || x.itemListElement.length));

  // サイド広告があるページだけ body.ads を付ける。CSS 側はこれを見て
  // PC で2カラムに切り替える。広告が無いのに 300px の列を確保すると、
  // 本文が痩せたうえ右に空白の帯が残り、レイアウトが崩れて見える。
  const cls = [opts.bodyClass, hasSideAd() ? 'ads' : ''].filter(Boolean).join(' ');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${attr(opts.description)}">
<link rel="canonical" href="${attr(opts.canonical)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="${opts.ogType || 'website'}">
<meta property="og:site_name" content="${attr(SITE.NAME)}">
<meta property="og:title" content="${attr(opts.title)}">
<meta property="og:description" content="${attr(opts.description)}">
<meta property="og:url" content="${attr(opts.canonical)}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${attr(asset('favicon.svg'))}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${attr(asset('style.css'))}">
${opts.head || ''}
<script type="application/ld+json">${JSON.stringify(ld.length === 1 ? ld[0] : ld)}</script>
${adsenseHead()}${analytics()}
</head>
<body${cls ? ` class="${attr(cls)}"` : ''}${opts.fileBase ? ` data-file="${attr(opts.fileBase)}"` : ''}>
${siteHeader()}
<main>
${opts.trail ? breadcrumb(opts.trail) : ''}
${body}
${opts.side === false ? '' : ad('side')}
</main>
${siteFooter()}
${opts.scripts || ''}
</body>
</html>`;
}

function siteHeader() {
  return `<header class="site">
  <a class="brand" href="${attr(url())}">
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M1 13 Q5 8 10 13 T19 13" fill="none" stroke="#2b5d7a" stroke-width="1.6"/><path d="M1 7 Q5 2 10 7 T19 7" fill="none" stroke="#b06a3f" stroke-width="1.6" opacity=".75"/></svg>
    <span class="brand-ja">${esc(SITE.NAME)}</span>
    <span class="brand-en">${esc(SITE.NAME_EN)}</span>
  </a>
  <nav class="site-nav"><a href="${attr(url())}#areas">地点をさがす</a></nav>
</header>`;
}

function siteFooter() {
  return `<footer class="site">
  <div class="src">
    <p>潮位は<a href="${attr(SITE.JMA_CREDIT_URL)}" rel="nofollow noopener" target="_blank">${esc(SITE.JMA_CREDIT)}</a>の公式推算値をそのまま表示しています。10分毎の値は毎時値を三次スプラインで補間したものです。</p>
    <p>天気・風・波・気温は<a href="${attr(SITE.JMA_FC_CREDIT_URL)}" rel="nofollow noopener" target="_blank">${esc(SITE.JMA_FC_CREDIT)}</a>を加工して作成しています。</p>
    <p>潮位は推算値であり実測値とは異なります。気象・地形の影響で変動するため、航行・遊泳・釣行の安全判断は必ず現地の状況と公的機関の情報で確認してください。</p>
  </div>
  <nav class="foot-nav"><a href="${attr(url())}">トップ</a><a href="${attr(url('about'))}">このサイトについて</a></nav>
  <p class="copy">© ${esc(SITE.NAME)}</p>
</footer>`;
}

// ---------------------------------------------------------------------
// 小物
// ---------------------------------------------------------------------

// 前後ナビ。href が null の項目は非活性で出す。
export function pager(prev, cur, next) {
  const cell = (o, cls) => o
    ? `<a class="${cls}" href="${attr(o.href)}"><span class="pg-lbl">${esc(o.label)}</span></a>`
    : `<span class="${cls} off"></span>`;
  return `<nav class="pager">${cell(prev, 'pg prev')}`
    + `<span class="pg cur">${cur}</span>${cell(next, 'pg next')}</nav>`;
}

// 表示モード切替（1日 / 1週間 / 1か月）。すべて実リンク。
export function viewTabs(items) {
  return `<nav class="tabs">` + items.map(i => i.active
    ? `<span class="tab on">${esc(i.label)}</span>`
    : `<a class="tab" href="${attr(i.href)}">${esc(i.label)}</a>`).join('') + `</nav>`;
}

export function section(title, en, inner, extra = '') {
  return `<section class="blk">
  <div class="blk-hd"><h2>${esc(title)}</h2>${en ? `<span class="en">${esc(en)}</span>` : ''}${extra}</div>
  ${inner}
</section>`;
}
