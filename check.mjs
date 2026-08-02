// =====================================================================
// 生成物の検査
//
//   node check.mjs
//
// 内部リンク切れ・title/description の重複・canonical の整合を見る。
// 11,000ページを人手で確認するのは無理なので、ここで機械的に潰す。
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { SITE } from './config.mjs';

const DIST = 'dist';
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else files.push(p);
  }
})(DIST);

const htmlFiles = files.filter(f => f.endsWith('index.html'));

// 実在する URL の集合（BASE を剥いだ形）
const exists = new Set();
for (const f of files) {
  let r = f.split(path.sep).join('/').replace(/^dist/, '');
  if (r.endsWith('/index.html')) r = r.slice(0, -'index.html'.length);
  exists.add(decodeURIComponent(r));
}

const titles = new Map();
const descs = new Map();
const broken = new Map();
let links = 0, noTitle = 0, noDesc = 0, noCanon = 0, bytes = 0;

for (const f of htmlFiles) {
  const t = fs.readFileSync(f, 'utf8');
  bytes += t.length;

  const tm = t.match(/<title>(.*?)<\/title>/s);
  if (tm) titles.set(tm[1], (titles.get(tm[1]) || 0) + 1); else noTitle++;

  const dm = t.match(/name="description" content="(.*?)"/s);
  if (dm) descs.set(dm[1], (descs.get(dm[1]) || 0) + 1); else noDesc++;

  if (!/<link rel="canonical" href="https?:\/\/[^"]+">/.test(t)) noCanon++;

  for (const m of t.matchAll(/href="(\/[^"#]*)"/g)) {
    let u = m[1];
    if (!u.startsWith(SITE.BASE)) continue;
    u = u.slice(SITE.BASE.length) || '/';
    links++;
    if (!exists.has(decodeURIComponent(u))) broken.set(u, (broken.get(u) || 0) + 1);
  }
}

const dupT = [...titles].filter(([, c]) => c > 1);
const dupD = [...descs].filter(([, c]) => c > 1);

console.log(`ページ数        ${htmlFiles.length}`);
console.log(`平均バイト      ${Math.round(bytes / htmlFiles.length)}`);
console.log(`内部リンク      ${links}`);
console.log(`リンク切れ      ${broken.size}`);
[...broken].slice(0, 10).forEach(([u, n]) => console.log(`   ${n} x ${u}`));
console.log(`title 無し      ${noTitle}`);
console.log(`title 重複      ${dupT.length}`);
dupT.slice(0, 5).forEach(([t, c]) => console.log(`   ${c} x ${t}`));
console.log(`description 無し ${noDesc}`);
console.log(`description 重複 ${dupD.length}`);
dupD.slice(0, 5).forEach(([d, c]) => console.log(`   ${c} x ${d.slice(0, 70)}…`));
console.log(`canonical 無し  ${noCanon}`);

const ok = broken.size === 0 && noTitle === 0 && noDesc === 0 && noCanon === 0 && dupT.length === 0;
console.log(ok ? '\nOK' : '\n問題あり');
process.exit(ok ? 0 : 1);
