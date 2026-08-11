// =====================================================================
// 用途別の入口ページ(/{slug}/)
//
// 地点データそのものは地方/都道府県/地点という地理軸でしか探せない。
// 「釣り」「潮干狩り」「サーフィン」のように用途から来る検索クエリを
// 受け止める入口を用意し、同じ地点データへ複数の切り口でリンクを張る。
// 活動ごとに向いた地点を選別・格付けするデータは持っていないため、
// 「この用途では潮汐のどこを見ればいいか」を解説したうえで、通常どおり
// 地方→都道府県→地点の入口へ渡す構成にしている。
// =====================================================================

import { SITE, url } from '../config.mjs';
import { page, esc, attr, ad, section, waveMark } from './html.mjs';
import { paths, abs } from './routes.mjs';

export const ACTIVITIES = [
  {
    slug: 'tsuri',
    title: '釣りの潮見表・タイドグラフ',
    tagline: '潮が動く時間帯を見て釣行の計画を立てる',
    description: '釣りに役立つ潮見表・タイドグラフ。潮が動く時間帯や大潮・中潮などの潮回りから、釣行のタイミングを判断できます。',
    intro: `
<p>釣りでは、満潮・干潮の時刻そのものより「潮がどれだけ動いているか」のほうが釣果に直結するとよく言われます。潮が動くとベイト（小魚）が動き、それを追うフィッシュイーターの活性も上がりやすいためです。</p>
<p>${esc(SITE.NAME)}の各地点ページには、10分刻みの潮位から算出した「<a href="${attr(url('guide', 'ugoku-jikantai'))}">潮がよく動く時間帯</a>」を掲載しています。満潮・干潮の時刻だけを見るより、釣行の時間帯を絞り込みやすくなります。潮回り（大潮・中潮など）の意味は<a href="${attr(url('guide', 'oshio-koshio'))}">大潮・小潮とは</a>で解説しています。</p>`,
  },
  {
    slug: 'shiohigari',
    title: '潮干狩りの潮見表・タイドグラフ',
    tagline: '大潮・中潮の干潮前後をねらう',
    description: '潮干狩りに役立つ潮見表・タイドグラフ。干潮前後の時間帯や、干潟が広く現れる大潮・中潮のタイミングを地点ごとに確認できます。',
    intro: `
<p>潮干狩りは、潮が引いて干潟が広く現れる時間帯に行うレジャーです。干満差が大きい<b>大潮・中潮</b>の、<b>干潮の前後2〜3時間</b>がねらい目になります。詳しい選び方は<a href="${attr(url('guide', 'shiohigari-shiodoki'))}">潮干狩りに向いている潮回り・時間帯の選び方</a>で解説しています。</p>
<p>各地点の10分毎グリッド・月間カレンダーには「潮干狩り/磯遊びモード」があり、しきい値（cm）を入力するとその潮位を下回る時間帯・日をハイライトできます。干潟の様子がその潮位でどれくらい現れるかは現地によって異なるため、最初は控えめな値から試すことをおすすめします。</p>`,
  },
  {
    slug: 'surfing',
    title: 'サーフィンの潮見表・タイドグラフ',
    tagline: '干満のタイミングを事前に把握する',
    description: 'サーフィンに役立つ潮見表・タイドグラフ。ポイントごとの満潮・干潮の時刻と潮位変化を確認できます。波高・うねりの予報は含みません。',
    intro: `
<p>ブレイクの状況は干満によって大きく変わるポイントが多く、同じスポットでも満潮寄りと干潮寄りでは波の質が変わります。${esc(SITE.NAME)}では地点ごとの満潮・干潮の時刻と10分刻みの潮位変化を掲載しているので、狙っているポイントが今日どのタイミングで満ちる・引くかを事前に把握できます。</p>
<p>ただし当サイトが扱っているのは天文潮位（推算値）のみで、<b>波高やうねりの予報は含みません</b>。地点ページから<a href="https://www.windy.com/" rel="nofollow noopener" target="_blank">Windy</a>への風・波のリンクを設けているので、あわせて確認してください。</p>`,
  },
];

export function activityBySlug(slug) {
  return ACTIVITIES.find(a => a.slug === slug);
}

function activityTrail(a) {
  return [
    { name: '全国', href: paths.home(), abs: abs.home() },
    { name: a.title, href: paths.activity(a.slug), abs: abs.activity(a.slug) },
  ];
}

// regions: [{ r: REGIONSの要素, count }]  homePage/regionPage と同じ形
export function activityPage(a, regions) {
  const others = ACTIVITIES.filter(x => x.slug !== a.slug);
  const body = `
<article>
  <header class="st-hd">
    <h1>${waveMark('wmm', 'home-mark')}${esc(a.title)}</h1>
    <p class="lede">${esc(a.tagline)}</p>
  </header>
  ${ad('header')}
  ${a.intro}
  ${section('地方から選ぶ', 'AREAS', `<ul class="regions">${regions.map(r =>
    `<li><a href="${attr(paths.region(r.r))}"><span class="rn">${esc(r.r.name)}</span><span class="rc">${r.count}地点</span></a></li>`).join('')}</ul>`)}
  ${ad('graph')}
  ${section('ほかの用途から探す', '', `<ul class="guide-list">${others.map(o =>
    `<li><a href="${attr(paths.activity(o.slug))}">${esc(o.title)}</a><span class="note">${esc(o.tagline)}</span></li>`).join('')}</ul>`)}
  <p class="more"><a href="${attr(paths.home())}">全国の地点一覧へ</a></p>
  ${ad('footer')}
</article>`;
  return page({
    title: `${a.title}${'｜'}${SITE.NAME}`,
    description: a.description,
    canonical: abs.activity(a.slug),
    trail: activityTrail(a),
  }, body);
}

export function activityIndexPage() {
  const title = `用途から選ぶ潮見表${'｜'}${SITE.NAME}`;
  const description = '釣り・潮干狩り・サーフィンなど、用途別に潮見表・タイドグラフの入口をまとめています。';
  const body = `
<article class="prose">
  <h1>用途から選ぶ</h1>
  <ul class="guide-list">
    ${ACTIVITIES.map(a => `<li><a href="${attr(paths.activity(a.slug))}">${esc(a.title)}</a><span class="note">${esc(a.tagline)}</span></li>`).join('')}
  </ul>
</article>`;
  return page({
    title, description,
    canonical: abs.activityIndex(),
    trail: [
      { name: '全国', href: paths.home(), abs: abs.home() },
      { name: '用途から選ぶ', href: paths.activityIndex(), abs: abs.activityIndex() },
    ],
  }, body);
}
