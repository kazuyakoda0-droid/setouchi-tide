// =====================================================================
// ホーム画面アイコン生成(apple-touch-icon / manifest用PNG)
//
// このリポジトリは依存パッケージなしの静的サイトジェネレータで、画像編集
// ライブラリは入れていない(scripts/og-image.htmlと同じ方針)。一方
// apple-touch-icon はSVG非対応でPNG必須なので、favicon.svgの波2本モチーフを
// Node標準の zlib(deflate)だけで手組みのPNGエンコーダに焼き込む。
// 一度実行して public/ に生成物をコミットすれば、以後のビルドでは使わない
// (og-image.pngと同じ「一回だけ焼く」運用)。
//
// 実行: node scripts/gen-icons.mjs
// =====================================================================

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const BG = [244, 241, 234];   // --bg (#f4f1ea)
const BLUE = [43, 93, 122];   // 潮位の線 (#2b5d7a)
// rust は元SVGで opacity .8 なので、背景に前もって合成した色を使う
const RUST_RAW = [176, 106, 63]; // (#b06a3f)
const RUST = RUST_RAW.map((c, i) => Math.round(c * 0.8 + BG[i] * 0.2));

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// rgba: Uint8ClampedArray, 1ピクセル4バイト(R,G,B,A)、左上原点・行優先
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // compression/filter/interlace = 標準

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // フィルタなし
    raw.set(rgba.subarray(y * stride, y * stride + stride), rowStart + 1);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function mix(base, top, alpha) {
  return base.map((c, i) => Math.round(c + (top[i] - c) * alpha));
}

// favicon.svg (32x32) の2本の波を、サイズに応じてラスタライズする。
// path1(藍, baseline21) → path2(弁柄, baseline12・上に重なる) の順で描画。
function renderIcon(size) {
  const s = size / 32;
  const amp = 6.5, period = 13, phase = 3;
  const strokeW = Math.max(1.6, 2.6 * s);
  const rgba = new Uint8ClampedArray(size * size * 4);

  const waveYPx = (x, baseline) => {
    const t = x / s;
    return (baseline - amp * Math.sin((2 * Math.PI * (t - phase)) / period)) * s;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = BG;
      const wy1 = waveYPx(x, 21);
      const d1 = Math.abs(y - wy1);
      const a1 = Math.max(0, Math.min(1, 1 - (d1 - strokeW / 2) / 1.2));
      if (a1 > 0) color = mix(color, BLUE, a1);
      const wy2 = waveYPx(x, 12);
      const d2 = Math.abs(y - wy2);
      const a2 = Math.max(0, Math.min(1, 1 - (d2 - strokeW / 2) / 1.2));
      if (a2 > 0) color = mix(color, RUST, a2);
      const i = (y * size + x) * 4;
      rgba[i] = color[0]; rgba[i + 1] = color[1]; rgba[i + 2] = color[2]; rgba[i + 3] = 255;
    }
  }
  return rgba;
}

for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  const rgba = renderIcon(size);
  const png = encodePNG(size, size, rgba);
  writeFileSync(path.join(PUBLIC_DIR, name), png);
  console.log(`generated ${name} (${size}x${size}, ${png.length}B)`);
}
