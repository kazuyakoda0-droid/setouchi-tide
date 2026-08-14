// audit-coastal-labels.mjs の照合結果を、表示名と地点データに反映する。
// 実行例: node scripts/generate-stations/apply-coastal-audit.mjs
import fs from 'node:fs';
import { PREFS } from '../../lib/stations.mjs';

const audit = JSON.parse(fs.readFileSync('.cache/station-label-audit.json', 'utf8'));
const stationsPath = 'lib/stations.mjs';
const labelsPath = 'lib/coastal-labels.mjs';
const prefNameById = new Map(PREFS.map(p => [p.id, p.name]));

// 湖・河川・内陸の桟橋として、潮汐表の対象外であることを個別確認した地点。
const confirmedInland = new Set([
  'n0065', 'n0071', 'n0072', 'n0073', 'n0086', 'n0151', 'n0152', 'n0172', 'n0173',
  'n0178', 'n0203', 'n0218', 'n0224', 'p000', 'p038', 'p087', 'p088',
]);

const wrongPrefecture = new Set(audit.results
  .filter(row => row.sourcePrefecture && row.sourcePrefecture !== prefNameById.get(row.pref))
  .map(row => row.id));
const removeIds = new Set([...confirmedInland, ...wrongPrefecture]);

const disambiguated = new Map([
  ['n0233', '斜里町（遠音別村・北部）'],
  ['n0358', '斜里町（遠音別村・南部）'],
  ['n0244', '泊村（北部）'],
  ['n0300', '泊村（南部）'],
]);

const labels = Object.fromEntries(audit.results
  .filter(row => !removeIds.has(row.id))
  .map(row => [row.id, disambiguated.get(row.id) || row.label])
  .sort(([a], [b]) => a.localeCompare(b)));

if (Object.values(labels).some(label => !label || /沿岸（補完\d+）/.test(label))) {
  throw new Error('補完地点名に有効な地名がありません');
}

const source = fs.readFileSync(stationsPath, 'utf8');
const existingIds = new Set([...source.matchAll(/id:'([^']+)'/g)].map(match => match[1]));
const removableIds = new Set([...removeIds].filter(id => existingIds.has(id)));
let removed = 0;
const next = source.split(/\r?\n/).filter(line => {
  const match = /id:'([^']+)'/.exec(line);
  if (!match || !removableIds.has(match[1])) return true;
  removed++;
  return false;
}).join(source.includes('\r\n') ? '\r\n' : '\n');
if (removed !== removableIds.size) throw new Error(`削除対象の地点を全て見つけられません: ${removed}/${removableIds.size}`);

fs.writeFileSync(stationsPath, next);
fs.writeFileSync(labelsPath, `// 国土地理院リバースジオコーダの照合結果から生成。\nexport const COASTAL_LABELS = ${JSON.stringify(labels, null, 2)};\n`);
console.log(`削除: ${removed}地点（内陸確認 ${confirmedInland.size} / 都道府県不一致 ${wrongPrefecture.size}）`);
console.log(`表示名更新: ${Object.keys(labels).length}地点`);
