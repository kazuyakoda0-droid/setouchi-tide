//
//   node scripts/generate-stations/index.mjs                      全国
//   node scripts/generate-stations/index.mjs --sample hiroshima    広島県のみ試験実行
//   node scripts/generate-stations/index.mjs --dry-run             lib/stations.mjs を書き換えず件数だけ表示
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIDE_STATIONS, PREFS } from '../../lib/stations.mjs';
import { loadYears } from '../../lib/jma.mjs';
import { fetchOsmCandidates } from './osm-source.mjs';
import { loadPrefectureGeoJSON, prefectureOf, nearestPrefectureOf, buildNameToId, buildBoundaryIndex } from './prefectures.mjs';
import { mergeCandidates } from './dedupe.mjs';
import { averageTidalRangeCm, tidalRangeVarianceExceeds, isRedundant } from './safety.mjs';
import { assignAnchor } from './anchor.mjs';
import { assignIds } from './ids.mjs';
import { insertIntoStationsFile } from './writer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIONS_PATH = path.join(__dirname, '..', '..', 'lib', 'stations.mjs');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sampleIdx = args.indexOf('--sample');
const samplePref = sampleIdx !== -1 ? args[sampleIdx + 1] : null;

async function main() {
  console.log('1/7 OSM候補を取得中...');
  const candidates = await fetchOsmCandidates({
    onProgress: (label, count, i, total) => console.log(`  [${i}/${total}] ${label}: ${count}件`),
    onFailure: (label, err, i, total) => console.warn(`  [${i}/${total}] ${label}: 取得失敗のため諦める (${err.message})`),
  });
  console.log(`  取得: ${candidates.length}件`);

  console.log('2/7 都道府県境界を取得中...');
  const geoJSON = await loadPrefectureGeoJSON();
  const nameToId = buildNameToId(PREFS);
  const boundaryIndex = buildBoundaryIndex(geoJSON, nameToId);

  console.log('3/7 都道府県を判定中...');
  // OSMの港湾・マリーナ・桟橋の点は簡略化された海岸線ポリゴンの外側
  // (海上)に位置することが多いため、まず厳密なpoint-in-polygonを試し、
  // 外れた場合は最寄りの境界線(5km以内)へフォールバックする。
  const withPref = [];
  let fallbackCount = 0, noPref = 0;
  for (const c of candidates) {
    let pref = prefectureOf(c.lat, c.lon, geoJSON, nameToId);
    if (!pref) {
      pref = nearestPrefectureOf(c.lat, c.lon, boundaryIndex, 5);
      if (pref) fallbackCount++;
    }
    if (!pref) { noPref++; continue; }
    withPref.push({ ...c, pref });
  }
  console.log(`  判定成功: ${withPref.length}件(うち近傍フォールバック${fallbackCount}件) / 判定不能(除外): ${noPref}件`);

  const scoped = samplePref ? withPref.filter(c => c.pref === samplePref) : withPref;

  console.log('4/7 既存地点との重複を除去中...');
  const { kept: deduped, excluded: dupExcluded } = mergeCandidates(TIDE_STATIONS, scoped, 3);
  console.log(`  残存: ${deduped.length}件 / 除外(重複): ${dupExcluded.length}件`);

  console.log('5/7 公式観測点の平均干満差を計算中(気象庁データ取得。数分かかる場合あり)...');
  const officialStations = TIDE_STATIONS.filter(s => !s.jmaAnchor);
  const year = new Date().getFullYear();
  const yearData = await loadYears(officialStations.map(s => s.jma), [year]);
  const officialWithRange = officialStations.map(s => ({
    ...s,
    avgRangeCm: averageTidalRangeCm(yearData[s.jma] || {}),
  }));

  console.log('6/7 安全基準(潮汐境界)を適用中...');
  const safe = [];
  let boundaryExcluded = 0;
  for (const c of deduped) {
    if (tidalRangeVarianceExceeds(c, officialWithRange)) { boundaryExcluded++; continue; }
    if (isRedundant(c, TIDE_STATIONS)) continue; // 二重チェック(dedupeで既に除去済みのはずだが念のため)
    safe.push(c);
  }
  console.log(`  残存: ${safe.length}件 / 除外(潮汐境界): ${boundaryExcluded}件`);

  console.log('7/7 最寄り観測点を割り当ててIDを発番中...');
  const existingIds = TIDE_STATIONS.map(s => s.id);
  const newIds = assignIds(existingIds, safe.length);
  const entries = safe.map((c, i) => {
    const anchor = assignAnchor(c, officialStations);
    return { id: newIds[i], name: c.name, lat: c.lat, lon: c.lon, pref: c.pref, ...anchor };
  });

  console.log(`\n完了見込み: 新規 ${entries.length}件（既存 ${TIDE_STATIONS.length}件 → 合計 ${TIDE_STATIONS.length + entries.length}件）`);

  if (dryRun) {
    console.log('--dry-run のため lib/stations.mjs は変更していません。');
    return;
  }

  const original = fs.readFileSync(STATIONS_PATH, 'utf8');
  const dateStr = new Date().toISOString().slice(0, 10);
  const updated = insertIntoStationsFile(original, entries, PREFS, dateStr);
  fs.writeFileSync(STATIONS_PATH, updated);
  console.log(`lib/stations.mjs を更新しました（+${entries.length}件）。`);
}

main().catch(e => { console.error(e); process.exit(1); });
