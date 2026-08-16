// =====================================================================
// サイト設定
//
// ドメインを移すときは ORIGIN と CNAME を書き換えるだけでよい。
// 生成される HTML 内のリンクはすべて BASE 起点の絶対パスなので、
// ここ以外を触る必要はない。
// =====================================================================

export const SITE = {
  // ---- ドメイン -----------------------------------------------------
  // 独自ドメイン japantide.com を apex で運用している。よって BASE は空。
  // CNAME を入れてあるので dist/CNAME が生成され、Actions デプロイでも
  // GitHub Pages のカスタムドメイン設定が失われない。
  //
  // GitHub Pages のプロジェクトページ配下に戻す場合は
  //   ORIGIN: 'https://kazuyakoda0-droid.github.io'
  //   BASE:   '/setouchi-tide'
  //   CNAME:  ''
  // にする。いずれも環境変数で上書きできる。
  ORIGIN: process.env.SITE_ORIGIN || 'https://japantide.com',
  BASE: process.env.SITE_BASE !== undefined
    ? (process.env.SITE_BASE === '/' ? '' : process.env.SITE_BASE.replace(/\/$/, ''))
    : '',
  CNAME: process.env.SITE_CNAME || 'japantide.com',

  NAME: 'しおどき',
  NAME_EN: 'SHIODOKI',
  TAGLINE: '気象庁の公式推算値による全国760地点の潮見表・タイドグラフ',

  // ---- 生成範囲 -----------------------------------------------------
  // 地点あたりのページ数 = 1(当日) + 1(週間) + MONTHS + DAYS_BACK+DAYS_FWD+1
  // 現在の設定では 1+1+14+16 = 32 ページ × 760 地点 = 24,320 ページ。
  // 気象庁の年次ファイルは1年分あるので、増やしたければ数字を上げるだけでよい
  // (ただし気象庁の天気予報は7日先までなので、それより外は天気が空欄になる)。
  //
  // DAYS_BACK は 1（昨日）だけ残す。過去日は「○月○日 潮見表」の検索需要が
  // ほぼ無いうえ、地点ハブや翌日以降のページと内容がほぼ同じ薄いページに
  // なるため。DAYS_FWD はその分を厚くし、「来週の釣行」「◯日先の予定」を
  // 調べる検索・実用需要をカバーする2週間先まで生成する。
  DAYS_BACK: 1,
  DAYS_FWD: 14,
  MONTHS_BACK: 1,
  // 月間カレンダーは当月から1年先まで。予定を立てるときに翌年の大潮・
  // 干潮もそのまま確認できるようにする。気象庁の年次潮位表を使うため、
  // 天気予報と異なり先の月でも潮汐データは表示できる。
  MONTHS_FWD: 12,

  // ---- 広告 ---------------------------------------------------------
  // AdSense の審査に通ったら ADSENSE_CLIENT に ca-pub-... を入れる。
  // 空のあいだは枠だけがレイアウトに存在し、広告スクリプトは出力されない
  // (審査前に空の広告タグを置くとポリシー違反になるため)。
  // ads.txt も ADSENSE_CLIENT が入ったときだけ生成される。
  ADSENSE_CLIENT: process.env.SITE_ADSENSE_CLIENT || 'ca-pub-3910557986459785',
  ADSENSE_SLOTS: {
    header: '3879784223', // ヘッダー下 レスポンシブ
    graph: '4483967615',  // 潮位グラフ直下 レクタングル(300x250)
    footer: '8940539213', // 記事末 レスポンシブ
    side: '3994113104',   // サイド(PCのみ) 300x600
  },

  // ---- OGP画像 --------------------------------------------------------
  // X/Facebook/Discord などでの共有カード用。`public/og-image.png`
  // (1200x630)を焼き直したいときは scripts/og-image.html を下書きとして
  // 使う。og:image は SVG非対応で PNG/JPG が要るが、このリポジトリは
  // 依存パッケージなしの静的サイトジェネレータなので画像編集ライブラリは
  // 入れていない。空にすると og:image / twitter:card を出力しない
  // (存在しない画像を指すとプレビューが崩れるため)。
  OG_IMAGE: process.env.SITE_OG_IMAGE || 'og-image.png',

  // ---- 運営者 ---------------------------------------------------------
  // AdSense審査や検索での信頼性評価は、運営者が明示されているサイトを
  // 好む。about/privacyに表示するほか、構造化データのfounderにも使う。
  OPERATOR_NAME: 'ksp',

  // ---- 問い合わせ ---------------------------------------------------
  // 静的サイトなのでフォームは持てない。Google フォームの URL を入れると
  // このサイトについて / プライバシーポリシー の両方に導線が出る。
  // 空だと連絡経路の無いサイトになり AdSense の審査で不利なので、
  // 申し込み前に必ず埋めること。
  CONTACT_URL: process.env.SITE_CONTACT_URL || 'https://forms.gle/H7gvcVnedC7kXVpc6',

  // ---- 解析 ---------------------------------------------------------
  GA_ID: '',                       // 例: 'G-XXXXXXXXXX'

  // ---- データ出典 ---------------------------------------------------
  JMA_TXT: 'https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt',
  JMA_CREDIT: '気象庁 潮位表',
  JMA_CREDIT_URL: 'https://www.data.jma.go.jp/kaiyou/db/tide/suisan/',
  // 気象・海象も気象庁に一本化した。Open-Meteo の無料 API は
  // 非商用限定で、広告を掲載した時点で規約から外れるため。
  JMA_FC_CREDIT: '気象庁 天気予報',
  JMA_FC_CREDIT_URL: 'https://www.jma.go.jp/bosai/forecast/',
};

// BASE 起点のページ URL。ディレクトリなので必ず末尾スラッシュを付ける。
export function url(...segs) {
  const path = segs.filter(s => s !== '' && s != null).join('/');
  const p = path ? '/' + path.replace(/^\/+|\/+$/g, '') + '/' : '/';
  return SITE.BASE + p;
}

// BASE 起点のファイル URL。末尾スラッシュを付けてはいけない。
// (url() を使うと style.css/ のようになり 404 になる)
export function asset(name) {
  return SITE.BASE + '/' + name.replace(/^\/+/, '');
}

// canonical / sitemap 用の絶対 URL。日本語セグメントは percent-encode する。
export function absUrl(...segs) {
  return SITE.ORIGIN + url(...segs).split('/').map(encodeURIComponent).join('/');
}
