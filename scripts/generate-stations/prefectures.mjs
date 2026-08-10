// 都道府県境界GeoJSONの取得・キャッシュと、座標→都道府県IDの判定。
//
// データ: piuccio/open-data-jp-prefectures-geojson (MITライセンス、商用利用可)
// 出典は国土数値情報 行政区域データ(N03)を都道府県単位に統合したもの。
// properties.P に都道府県名（例:"東京都"）が入っている。

import fs from 'node:fs';
import path from 'node:path';
import { pointInGeometry } from './geo.mjs';

const SOURCE_URL = 'https://raw.githubusercontent.com/piuccio/open-data-jp-prefectures-geojson/master/output/prefectures.geojson';
const CACHE_PATH = path.join(process.cwd(), '.cache', 'geo', 'prefectures.geojson');

export async function loadPrefectureGeoJSON({ fetchImpl = fetch } = {}) {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    // キャッシュなし。取得してキャッシュする。
  }
  const res = await fetchImpl(SOURCE_URL);
  if (!res.ok) throw new Error(`都道府県境界データの取得に失敗: HTTP ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, text);
  return JSON.parse(text);
}

// nameToId: { "東京都": "tokyo", ... }
export function prefectureOf(lat, lon, geoJSON, nameToId) {
  for (const feature of geoJSON.features) {
    const jpName = feature.properties.P;
    const id = nameToId[jpName];
    if (!id) continue; // PREFS に無い名前は無視(想定外データの防御)
    if (pointInGeometry(lat, lon, feature.geometry)) return id;
  }
  return null;
}

export function buildNameToId(PREFS) {
  const out = {};
  for (const p of PREFS) out[p.name] = p.id;
  return out;
}
