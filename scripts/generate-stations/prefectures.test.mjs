import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefectureOf, buildNameToId, buildBoundaryIndex, nearestPrefectureOf } from './prefectures.mjs';

const FAKE_PREFS = [
  { id: 'tokyo', name: '東京都' },
  { id: 'osaka', name: '大阪府' },
];

const FAKE_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { P: '東京都' },
      geometry: { type: 'Polygon', coordinates: [[[139, 35], [139, 36], [140, 36], [140, 35], [139, 35]]] },
    },
    {
      type: 'Feature',
      properties: { P: '大阪府' },
      geometry: { type: 'Polygon', coordinates: [[[135, 34], [135, 35], [136, 35], [136, 34], [135, 34]]] },
    },
  ],
};

test('buildNameToId: PREFSの name→id マップを作る', () => {
  assert.deepEqual(buildNameToId(FAKE_PREFS), { '東京都': 'tokyo', '大阪府': 'osaka' });
});

test('prefectureOf: 東京都の矩形内の点は tokyo を返す', () => {
  const nameToId = buildNameToId(FAKE_PREFS);
  assert.equal(prefectureOf(35.5, 139.5, FAKE_GEOJSON, nameToId), 'tokyo');
});

test('prefectureOf: どの都道府県にも入らない点は null', () => {
  const nameToId = buildNameToId(FAKE_PREFS);
  assert.equal(prefectureOf(0, 0, FAKE_GEOJSON, nameToId), null);
});

test('prefectureOf: PREFSに無い名前のfeatureは無視される', () => {
  const nameToId = { '東京都': 'tokyo' };
  assert.equal(prefectureOf(34.5, 135.5, FAKE_GEOJSON, nameToId), null);
});

// 実際の海岸線ポリゴンは頂点が密（数百m間隔以下）なので、テスト用の
// フィクスチャも「境界沿いに頂点が並ぶ」形にしておく（4隅だけの矩形だと
// 最近傍頂点までの距離が実態よりずっと遠くなり、この関数の実用上の
// 挙動を再現できない）。
const DENSE_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { P: '東京都' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [139, 35], [139.5, 35], [140, 35], [140, 35.25], [140, 35.5],
          [140, 35.75], [140, 36], [139.5, 36], [139, 36], [139, 35],
        ]],
      },
    },
  ],
};

test('nearestPrefectureOf: ポリゴン境界のすぐ外側(海上)の点は最も近い都道府県に割り当てる', () => {
  const nameToId = buildNameToId(FAKE_PREFS);
  const index = buildBoundaryIndex(DENSE_GEOJSON, nameToId);
  // 頂点 [140, 35.5] のすぐ東（沖合約1km）
  assert.equal(nearestPrefectureOf(35.5, 140.01, index, 5), 'tokyo');
});

test('nearestPrefectureOf: maxKmを超える遠さならnull', () => {
  const nameToId = buildNameToId(FAKE_PREFS);
  const index = buildBoundaryIndex(DENSE_GEOJSON, nameToId);
  assert.equal(nearestPrefectureOf(0, 0, index, 5), null);
});
