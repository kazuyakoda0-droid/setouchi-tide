// =====================================================================
// 気象庁 潮位表（年次テキストファイル）の取得とパース
//
// 従来アプリはブラウザから suisan.php を叩いて HTML を DOMParser で
// 読んでいたが、ビルド時は年次テキストのほうが圧倒的に扱いやすい。
//
//   https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/{年}/{コード}.txt
//
// 1ファイル = 1観測点の1年分（365行 × 136桁の固定長）。
// 1リクエストで1年分が取れるので、241観測点 × 年数 のリクエストで済む。
//
// 行のレイアウト（0起点・すべて固定長）:
//   [  0.. 71]  毎時潮位 24個 × 3桁 (cm, 負値あり)
//   [ 72.. 77]  年(2) 月(2) 日(2)  ※空白パディング
//   [ 78.. 79]  観測点コード
//   [ 80..107]  満潮 4組 × (時2桁 + 分2桁 + 潮位3桁)
//   [108..135]  干潮 4組 × 同上
//   欠測は時刻 '9999' / 潮位 '999'
//
// 値が既存アプリ(suisan.php 経由)と一致することは 広島(Q8) 2026-08-02 で
// 確認済み: 満潮 11:45 338cm / 干潮 05:53 98cm・17:59 51cm。
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { SITE } from '../config.mjs';
import { pad2 } from './util.mjs';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'jma');
const CACHE_MAX_AGE = 30 * 86400000;   // 年次表の改訂を拾うため月1で取り直す

function cachePath(year, code) {
  return path.join(CACHE_DIR, String(year), code + '.txt');
}

function readCache(year, code) {
  const p = cachePath(year, code);
  try {
    const st = fs.statSync(p);
    if (Date.now() - st.mtimeMs > CACHE_MAX_AGE) return null;
    return fs.readFileSync(p, 'latin1');
  } catch {
    return null;
  }
}

function writeCache(year, code, text) {
  const p = cachePath(year, code);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'latin1');
}

async function fetchYear(year, code, attempt = 0) {
  const cached = readCache(year, code);
  if (cached) return cached;

  const u = `${SITE.JMA_TXT}/${year}/${code}.txt`;
  try {
    // ヘッダは ByteString なので ASCII に限る（SITE.NAME は日本語で入れられない）
    const res = await fetch(u, { headers: { 'User-Agent': 'japan-tide-atlas static site builder' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString('latin1');
    if (text.length < 1000) throw new Error('短すぎる応答 (' + text.length + ' bytes)');
    writeCache(year, code, text);
    return text;
  } catch (e) {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      return fetchYear(year, code, attempt + 1);
    }
    throw new Error(`気象庁 ${year}/${code}.txt の取得に失敗: ${e.message}`);
  }
}

function num(s) {
  const t = s.trim();
  if (t === '' || t === '999' || t === '9999') return null;
  const v = parseInt(t, 10);
  return Number.isNaN(v) ? null : v;
}

// 1年分のテキスト → { 'YYYY-MM-DD': { hourly:[24], high:[...], low:[...] } }
export function parseYear(text, year) {
  const out = {};
  for (const line of text.split('\n')) {
    if (line.length < 136) continue;

    const mo = parseInt(line.slice(74, 76).trim(), 10);
    const da = parseInt(line.slice(76, 78).trim(), 10);
    if (!mo || !da) continue;

    const hourly = [];
    for (let i = 0; i < 24; i++) hourly.push(num(line.slice(i * 3, i * 3 + 3)));

    const readExtremes = (base, type) => {
      const arr = [];
      for (let k = 0; k < 4; k++) {
        const o = base + k * 7;
        const hh = line.slice(o, o + 2).trim();
        const mm = line.slice(o + 2, o + 4).trim();
        const lv = num(line.slice(o + 4, o + 7));
        if (hh === '99' || hh === '' || lv == null) continue;
        arr.push({ type, time: parseInt(hh, 10) + parseInt(mm, 10) / 60, level: lv });
      }
      return arr;
    };

    out[`${year}-${pad2(mo)}-${pad2(da)}`] = {
      hourly,
      extremes: [...readExtremes(80, '満潮'), ...readExtremes(108, '干潮')]
        .sort((a, b) => a.time - b.time),
    };
  }
  return out;
}

// 必要な観測点コード × 年 をまとめて取得する。
// 気象庁のサーバに負荷をかけないよう同時実行数を絞る。
export async function loadYears(codes, years, { concurrency = 6, onProgress } = {}) {
  const jobs = [];
  for (const y of years) for (const c of codes) jobs.push([y, c]);

  const total = jobs.length;
  const data = {};   // data[code][dayKey]
  let done = 0;

  async function worker() {
    for (;;) {
      const job = jobs.shift();
      if (!job) return;
      const [y, c] = job;
      const parsed = parseYear(await fetchYear(y, c), y);
      (data[c] ||= {});
      Object.assign(data[c], parsed);
      done++;
      if (onProgress) onProgress(done, total);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return data;
}
