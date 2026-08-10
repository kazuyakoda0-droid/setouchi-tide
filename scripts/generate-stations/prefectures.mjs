// 都道府県境界GeoJSONの取得・キャッシュと、座標→都道府県IDの判定。
//
// データ: piuccio/open-data-jp-prefectures-geojson (MITライセンス、商用利用可)
// 出典は国土数値情報 行政区域データ(N03)を都道府県単位に統合したもの。
// properties.P に都道府県名（例:"東京都"）が入っている。

import fs from 'node:fs';
import path from 'node:path';
import { pointInGeometry, haversineKm } from './geo.mjs';

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

function ringsOf(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

function boundsOf(rings) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }
  return { minLat, maxLat, minLon, maxLon };
}

// nearestPrefectureOf() を何度も呼ぶ前に一度だけ作る索引。
// 各都道府県の全頂点をバウンディングボックス付きで持つ。
export function buildBoundaryIndex(geoJSON, nameToId) {
  const features = [];
  for (const feature of geoJSON.features) {
    const id = nameToId[feature.properties.P];
    if (!id) continue; // PREFS に無い名前は無視(想定外データの防御)
    const rings = ringsOf(feature.geometry);
    features.push({ id, rings, bounds: boundsOf(rings) });
  }
  return features;
}

// point-in-polygon で一致しない場合のフォールバック判定。
// OSMの港湾・マリーナ・桟橋・フェリーターミナルの点は、簡略化された
// 海岸線ポリゴンの外側（＝海上）に位置することが多いため、最も近い
// 都道府県境界線までの距離で判定する。maxKmを超える場合はnullを返す
// (対岸の都道府県に誤って割り当てるのを避けるため)。
export function nearestPrefectureOf(lat, lon, boundaryIndex, maxKm = 5) {
  const degMargin = maxKm / 111; // 粗いバウンディングボックス絞り込み用
  let bestId = null, bestDist = Infinity;
  for (const { id, rings, bounds } of boundaryIndex) {
    if (lat < bounds.minLat - degMargin || lat > bounds.maxLat + degMargin) continue;
    if (lon < bounds.minLon - degMargin || lon > bounds.maxLon + degMargin) continue;
    for (const ring of rings) {
      for (const [vlon, vlat] of ring) {
        if (Math.abs(vlat - lat) > degMargin || Math.abs(vlon - lon) > degMargin) continue;
        const d = haversineKm({ lat, lon }, { lat: vlat, lon: vlon });
        if (d < bestDist) { bestDist = d; bestId = id; }
      }
    }
  }
  return bestDist <= maxKm ? bestId : null;
}
