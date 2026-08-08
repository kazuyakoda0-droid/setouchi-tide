// =====================================================================
// Google Fonts (Zen Old Mincho / Zen Kaku Gothic New / DM Mono) を
// このサイトが実際に使う文字だけに絞って自前ホストする。
//
//   node scripts/subset-fonts.mjs
//
// ビルドパイプラインには含めない。ネットワーク越しに Google Fonts へ
// アクセスする一度きりの資産生成スクリプトで、地点名(lib/stations.mjs)
// が増えて未収録の漢字が出たときにだけ手で再実行する。
//
// 仕組み:
//   1. lib/*.mjs, config.mjs, public/*.js のソースから使われている
//      文字を全部集める(地点名・かな・UI文言は静的にこれらの中にある)。
//   2. Google Fonts の CSS2 API を叩き、各ウェイトが実際には
//      unicode-range で数百個の小さな woff2 に分割されていることを踏まえ、
//      使う文字を1つも含まないブロックは捨てる。
//      (日本語フォントの CJK ブロックには /* japanese */ のような名前が
//      付かず無名なので、コメントの有無に頼らず全ブロックを見る)
//   3. 残ったブロックだけ public/fonts/ にダウンロードし、
//      public/fonts.css にローカル参照の @font-face を書き出す。
//
// これにより、ページ表示時にブラウザが実際に取得するのは「そのページの
// 文字が該当する数個の小さなファイル」だけになる(Google のCDNが元々
// やっていたのと同じ分割方式をそのまま自前ホストに持ち込むだけ)。
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FONTS_DIR = path.join(ROOT, 'public', 'fonts');
const FONTS_CSS = path.join(ROOT, 'public', 'fonts.css');

const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?'
  + 'family=Zen+Old+Mincho:wght@400;500;600;700'
  + '&family=Zen+Kaku+Gothic+New:wght@400;500;700'
  + '&family=DM+Mono:wght@400;500'
  + '&display=swap';

// woff2 の unicode-range 版CSSが返るのはモダンブラウザ向けレスポンスの
// ときだけなので、Chrome の User-Agent を指定して取得する。
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`${res.statusCode} ${url}`)); return; }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`${res.statusCode} ${url}`)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// ---- 1. 使われている文字を集める -------------------------------------
function collectUsedChars() {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', '.cache'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|js)$/.test(e.name)) files.push(p);
    }
  })(ROOT);

  const chars = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x21 && cp !== 0x7f) chars.add(ch); // 制御文字・空白以外
    }
  }
  return new Set([...chars].map((c) => c.codePointAt(0)));
}

// ---- 2. Google Fonts CSS を解析し、使う文字を含むブロックだけ残す -----
function parseRanges(rangeStr) {
  return rangeStr.split(',').map((s) => s.trim()).map((tok) => {
    const m = tok.match(/^U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f]+))?$/);
    if (!m) return null;
    if (m[1].includes('?')) {
      return [parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'f'), 16)];
    }
    const lo = parseInt(m[1], 16);
    return [lo, m[2] ? parseInt(m[2], 16) : lo];
  }).filter(Boolean);
}

function intersects(ranges, neededCps) {
  for (const [lo, hi] of ranges) {
    for (const cp of neededCps) if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

function parseFontFaceBlocks(css) {
  const blocks = [];
  const re = /@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[1];
    blocks.push({
      family: body.match(/font-family:\s*'([^']+)'/)[1],
      weight: body.match(/font-weight:\s*(\d+)/)[1],
      style: body.match(/font-style:\s*(\w+)/)[1],
      url: body.match(/url\(([^)]+)\)/)[1],
      unicodeRange: body.match(/unicode-range:\s*([^;]+);/)[1],
    });
  }
  return blocks;
}

// ---- 実行 -------------------------------------------------------------
console.log('使用文字を収集中...');
const neededCps = collectUsedChars();
console.log(`  ${neededCps.size} 文字`);

console.log('Google Fonts CSS を取得中...');
const css = await fetchText(GOOGLE_FONTS_URL);
const blocks = parseFontFaceBlocks(css);
console.log(`  ${blocks.length} ブロック`);

const keep = blocks.filter((b) => intersects(parseRanges(b.unicodeRange), neededCps));
console.log(`  → 使用文字を含むブロック: ${keep.length}`);

console.log('フォントファイルをダウンロード中...');
fs.rmSync(FONTS_DIR, { recursive: true, force: true });
fs.mkdirSync(FONTS_DIR, { recursive: true });

const manifest = [];
let i = 0, totalBytes = 0;
for (const b of keep) {
  i++;
  const fname = `${b.family.toLowerCase().replace(/\s+/g, '-')}-${b.weight}-${i}.woff2`;
  const buf = await fetchBuffer(b.url);
  fs.writeFileSync(path.join(FONTS_DIR, fname), buf);
  totalBytes += buf.length;
  manifest.push({ ...b, file: fname });
  if (i % 50 === 0) process.stdout.write(`\r  ${i}/${keep.length}`);
}
console.log(`\r  ${i}/${keep.length} 完了 (${(totalBytes / 1024).toFixed(0)} KB)`);

console.log('fonts.css を書き出し中...');
let out = '/* Zen Old Mincho / Zen Kaku Gothic New / DM Mono の自前ホスト版。\n'
  + '   このサイトが実際に使う文字だけに絞ったサブセット。\n'
  + '   scripts/subset-fonts.mjs で再生成する。 */\n\n';
for (const b of manifest) {
  out += `@font-face {\n  font-family: '${b.family}';\n  font-style: ${b.style};\n`
    + `  font-weight: ${b.weight};\n  font-display: swap;\n`
    + `  src: url(fonts/${b.file}) format('woff2');\n`
    + `  unicode-range: ${b.unicodeRange};\n}\n`;
}
fs.writeFileSync(FONTS_CSS, out);

console.log(`完了: public/fonts/ に${manifest.length}ファイル、public/fonts.cssを生成しました。`);
