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
import { fetchOsmCandidates, overpassQueries } from './osm-source.mjs';
import { loadPrefectureGeoJSON, prefectureOf, nearestPrefectureOf, buildNameToId, buildBoundaryIndex } from './prefectures.mjs';
import { mergeCandidates } from './dedupe.mjs';
import { averageTidalRangeCm, tidalRangeVarianceExceeds, isRedundant, isTooFarFromAnchor, isKnownNonTidalPlace } from './safety.mjs';
import { assignAnchor } from './anchor.mjs';
import { nearestOfficialStation } from './anchor.mjs';
import { haversineKm } from './geo.mjs';
import { assignIds } from './ids.mjs';
import { insertIntoStationsFile } from './writer.mjs';
import { coastalCandidates } from './coastline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIONS_PATH = path.join(__dirname, '..', '..', 'lib', 'stations.mjs');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const includeLow = args.includes('--include-low');
const coastlineOnly = args.includes('--coastline-only');
const spacingIdx = args.indexOf('--target-spacing');
const targetSpacingKm = spacingIdx !== -1 ? Number(args[spacingIdx + 1]) : 20;
const maxNewIdx = args.indexOf('--max-new');
const maxNew = maxNewIdx !== -1 ? Number(args[maxNewIdx + 1]) : 600;
const tagIdx = args.indexOf('--tag');
const tagFilter = tagIdx !== -1 ? args[tagIdx + 1] : null;
const sampleIdx = args.indexOf('--sample');
const samplePref = sampleIdx !== -1 ? args[sampleIdx + 1] : null;

function distanceToNearest(candidate, points) {
  return points.reduce((best, point) => Math.min(best, haversineKm(candidate, point)), Infinity);
}

// Prefer candidates in geographic gaps. A 20km target retains a 10km minimum
// separation, so repeated candidates do not crowd already well-covered shores.
function selectCoverageCandidates(candidates, existing, { targetSpacingKm, maxNew }) {
  const minSpacingKm = targetSpacingKm / 2;
  const remaining = candidates.slice();
  const selected = [];
  while (remaining.length && selected.length < maxNew) {
    let bestIndex = -1;
    let bestDistance = -Infinity;
    const coveragePoints = selected.length ? [...existing, ...selected] : existing;
    for (let i = 0; i < remaining.length; i++) {
      const distance = distanceToNearest(remaining[i], coveragePoints);
      if (distance > bestDistance) { bestDistance = distance; bestIndex = i; }
    }
    if (bestDistance < minSpacingKm) break;
    selected.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }
  return { selected, minSpacingKm };
}

async function main() {
  if (!Number.isFinite(targetSpacingKm) || targetSpacingKm <= 0) throw new Error('--target-spacing must be a positive number');
  if (!Number.isFinite(maxNew) || maxNew <= 0) throw new Error('--max-new must be a positive number');
  console.log('1/7 OSM候補を取得中...');
  const normalizedTag = tagFilter ? tagFilter.replace('=', '"="') : '';
  const queries = tagFilter ? overpassQueries().filter(q => q.label.includes(normalizedTag)) : undefined;
  if (tagFilter && queries.length === 0) throw new Error(`該当するOSMタグがありません: ${tagFilter}`);
  let candidates = coastlineOnly ? [] : await fetchOsmCandidates({
    queries,
    onProgress: (label, count, i, total) => console.log(`  [${i}/${total}] ${label}: ${count}件`),
    onFailure: (label, err, i, total) => console.warn(`  [${i}/${total}] ${label}: 取得失敗のため諦める (${err.message})`),
  });
  console.log(`  取得: ${candidates.length}件`);

  console.log('2/7 都道府県境界を取得中...');
  const geoJSON = await loadPrefectureGeoJSON();
  const nameToId = buildNameToId(PREFS);
  const boundaryIndex = buildBoundaryIndex(geoJSON, nameToId);

  if (candidates.length === 0) {
    // The location feed can occasionally be unavailable. Do not fabricate
    // named ports: sample verified coastline geometry and label the result
    // plainly as a supplementary coastal point instead.
    candidates = coastalCandidates(geoJSON, nameToId, PREFS).filter(c => distanceToNearest(c, TIDE_STATIONS) <= 35);
    console.warn(`  OSM候補が0件のため、沿岸補完候補 ${candidates.length}件を使用します`);
  }

  console.log('3/7 都道府県を判定中...');
  // OSMの港湾・マリーナ・桟橋の点は簡略化された海岸線ポリゴンの外側
  // (海上)に位置することが多いため、まず厳密なpoint-in-polygonを試し、
  // 外れた場合は最寄りの境界線(5km以内)へフォールバックする。
  const withPref = [];
  let fallbackCount = 0, noPref = 0;
  for (const c of candidates) {
    let pref = c.pref || prefectureOf(c.lat, c.lon, geoJSON, nameToId);
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

  console.log('6/7 安全基準(潮汐境界・遠すぎる観測点)を適用中...');
  const safe = [];
  let boundaryExcluded = 0, tooFarExcluded = 0, nonTidalExcluded = 0, lowKept = 0;
  for (const c of deduped) {
    if (isKnownNonTidalPlace(c)) { nonTidalExcluded++; continue; }
    if (tidalRangeVarianceExceeds(c, officialWithRange)) { boundaryExcluded++; continue; }
    if (isTooFarFromAnchor(c, officialStations)) {
      const nearest = nearestOfficialStation(c, officialStations);
      // 25kmを超える候補は通常は採用しない。明示指定時だけ60km以内を△参考地点として残す。
      if (!includeLow || !nearest || haversineKm(c, nearest) > 60) { tooFarExcluded++; continue; }
      safe.push({ ...c, approxQuality: 'low' });
      lowKept++;
      continue;
    }
    if (isRedundant(c, TIDE_STATIONS)) continue; // 二重チェック(dedupeで既に除去済みのはずだが念のため)
    safe.push(c);
  }
  console.log(`  残存: ${safe.length}件（△参考地点: ${lowKept}件） / 除外(潮汐境界): ${boundaryExcluded}件 / 除外(観測点から遠すぎる): ${tooFarExcluded}件 / 除外(内陸の既知パターン): ${nonTidalExcluded}件`);

  console.log('7/7 最寄り観測点を割り当ててIDを発番中...');
  const { selected: coverageSelected, minSpacingKm } = selectCoverageCandidates(
    safe, TIDE_STATIONS, { targetSpacingKm, maxNew },
  );
  console.log(`  Coverage selection: ${coverageSelected.length}/${safe.length} candidates, minimum ${minSpacingKm}km, target ${targetSpacingKm}km`);
  const existingIds = TIDE_STATIONS.map(s => s.id);
  const newIds = assignIds(existingIds, coverageSelected.length);
  const entries = coverageSelected.map((c, i) => {
    const anchor = assignAnchor(c, officialStations);
    return { id: newIds[i], name: c.name, lat: c.lat, lon: c.lon, pref: c.pref, approxQuality: c.approxQuality, ...anchor };
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
