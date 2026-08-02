// =====================================================================
// サイト設定
//
// 独自ドメインを取得したら ORIGIN と BASE を書き換えるだけで移行できる。
// 生成される HTML 内のリンクはすべて BASE 起点の絶対パスなので、
// ここ以外を触る必要はない。
// =====================================================================

export const SITE = {
  // ---- ドメイン -----------------------------------------------------
  // GitHub Pages のプロジェクトページは <user>.github.io/<repo>/ に載るため
  // BASE にリポジトリ名が必要。独自ドメインに移すときは
  //   ORIGIN: 'https://example.jp'
  //   BASE:   ''
  // にして、public/CNAME を作る(下の CNAME を設定すれば自動生成される)。
  // 環境変数で上書きできる。ローカルプレビューは SITE_BASE=/ で
  // ルート配信にすると、そのまま http://localhost:PORT/ で確認できる。
  ORIGIN: process.env.SITE_ORIGIN || 'https://kazuyakoda0-droid.github.io',
  BASE: process.env.SITE_BASE !== undefined
    ? (process.env.SITE_BASE === '/' ? '' : process.env.SITE_BASE.replace(/\/$/, ''))
    : '/setouchi-tide',
  CNAME: process.env.SITE_CNAME || '',   // 例: 'tide-atlas.jp'。空なら CNAME を作らない

  NAME: '全国タイド',
  NAME_EN: 'JAPAN TIDE ATLAS',
  TAGLINE: '気象庁の公式推算値による全国548地点の潮見表・タイドグラフ',

  // ---- 生成範囲 -----------------------------------------------------
  // 地点あたりのページ数 = 1(当日) + 1(週間) + MONTHS + DAYS_BACK+DAYS_FWD+1
  // 現在の設定では 1+1+3+15 = 20 ページ × 548 地点 = 10,960 ページ。
  // 気象庁の年次ファイルは1年分あるので、増やしたければ数字を上げるだけでよい
  // (ただし気象庁の天気予報は7日先までなので、それより外は天気が空欄になる)。
  DAYS_BACK: 7,
  DAYS_FWD: 7,
  MONTHS_BACK: 1,
  MONTHS_FWD: 1,

  // ---- 広告 ---------------------------------------------------------
  // AdSense の審査に通ったら ADSENSE_CLIENT に ca-pub-... を入れる。
  // 空のあいだは枠だけがレイアウトに存在し、広告スクリプトは出力されない
  // (審査前に空の広告タグを置くとポリシー違反になるため)。
  ADSENSE_CLIENT: '',
  ADSENSE_SLOTS: {
    header: '',    // ヘッダー下 レスポンシブ
    graph: '',     // 潮位グラフ直下 レクタングル
    footer: '',    // 記事末 レスポンシブ
    side: '',      // サイド(PCのみ) 300x600
  },

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
