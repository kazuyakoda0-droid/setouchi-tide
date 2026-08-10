import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefectureOf, buildNameToId } from './prefectures.mjs';

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
