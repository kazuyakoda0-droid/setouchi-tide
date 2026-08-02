# 全国タイド / JAPAN TIDE ATLAS

気象庁の公式推算値による全国548地点の潮見表・タイドグラフ。
静的サイトジェネレータ（依存パッケージなし・Node 20+ のみ）。

## 使い方

```bash
node build.mjs            # 全ページ生成（約11,000ページ）
node build.mjs --sample   # 広島県だけ生成（数秒。動作確認用）
```

生成物は `dist/` に出る。リポジトリにはコミットしない。
GitHub Actions が毎日ビルドし、Pages の artifact として直接デプロイする。

ローカルで見るときは、`BASE` をルートにしてから配信する:

```bash
SITE_BASE= node build.mjs --sample && npx serve dist
```

## 構成

| ファイル | 役割 |
|---|---|
| `config.mjs` | ドメイン・生成範囲・広告ID・解析ID。**移行時に触るのはここだけ** |
| `build.mjs` | 全ページの生成、sitemap、robots.txt |
| `lib/stations.mjs` | 観測点548件の定義（自動生成データ。手で編集しない） |
| `lib/jma.mjs` | 気象庁 年次潮位表テキストの取得・パース・キャッシュ |
| `lib/tide.mjs` | 10分刻みへの補間、近似地点補正、潮位変化速度 |
| `lib/astro.mjs` | 太陽・月・月齢・潮名 |
| `lib/routes.mjs` | URL 設計とスラッグ |
| `lib/html.mjs` | `<head>` の SEO 一式、ヘッダー/フッター、広告枠 |
| `lib/components.mjs` | グラフ・グリッド・カレンダーなどの部品 |
| `lib/pages.mjs` | 各ページのテンプレート |
| `public/` | `style.css` / `app.js` / `favicon.svg`（そのまま dist にコピー） |

## URL

```
/                                 トップ
/{region}/                        地方 (9)
/{pref}/                          都道府県 (39)
/{pref}/{station}/                地点・当日 (548)
/{pref}/{station}/week/           週間 (548)
/{pref}/{station}/{YYYY-MM}/      月間 (548 × 3)
/{pref}/{station}/{YYYY-MM-DD}/   日別 (548 × 15)
```

生成数は `config.mjs` の `DAYS_BACK` / `DAYS_FWD` / `MONTHS_BACK` / `MONTHS_FWD` で決まる。
気象庁の年次ファイルは1年分あるので、増やしたければ数字を上げるだけでよい
（ただし +16日を超える日は Open-Meteo の予報がなく気象欄が空になる）。

## データ

- **潮位** … 気象庁 潮位表の年次テキスト
  `https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/{年}/{コード}.txt`
  1ファイル = 1観測点の1年分（365行 × 136桁の固定長）。
  241観測点ぶんをビルド時に取得し、`.cache/jma/` に保存する。
- **気象・海象** … Open-Meteo（forecast API / marine API）。
  刻々変わるので静的化せず、クライアントで取得する。

## 独自ドメインへの移行

1. `config.mjs` の `ORIGIN` をドメインに、`BASE` を `''` にする
2. `CNAME` にドメインを書く（`dist/CNAME` が自動生成される）
3. DNS を GitHub Pages に向ける
4. 旧 URL からのリダイレクトは GitHub Pages では張れないため、
   Search Console のアドレス変更ツールを使う

## 広告

`config.mjs` の `ADSENSE_CLIENT` が空のあいだは、広告枠の `div` だけが出て
スクリプトも `ins` も出力されない（審査前に空の広告タグを置くのはポリシー違反のため）。
CSS で `.ad:empty { display: none }` としてあるので、有効化するまで枠は画面を占有しない。

審査に通ったら `ADSENSE_CLIENT` と `ADSENSE_SLOTS` の4枠を埋める。
枠は ヘッダー下 / グラフ直下 / 記事末 / サイド(1080px以上) の4か所。
