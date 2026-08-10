import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery, parseOverpassResponse, fetchOsmCandidates } from './osm-source.mjs';

test('buildOverpassQuery: 対象タグをすべて含む', () => {
  const q = buildOverpassQuery();
  assert.match(q, /natural"="beach"/);
  assert.match(q, /leisure"="marina"/);
  assert.match(q, /man_made"="pier"/);
  assert.match(q, /leisure"="fishing"/);
  assert.match(q, /out center;/);
});

test('parseOverpassResponse: nodeはlat/lonをそのまま使う', () => {
  const json = {
    elements: [
      { type: 'node', lat: 35.1, lon: 139.1, tags: { name: '○○海水浴場', natural: 'beach' } },
    ],
  };
  assert.deepEqual(parseOverpassResponse(json), [{ name: '○○海水浴場', lat: 35.1, lon: 139.1, tag: 'natural=beach' }]);
});

test('parseOverpassResponse: wayはcenterを使う', () => {
  const json = {
    elements: [
      { type: 'way', center: { lat: 34.5, lon: 133.5 }, tags: { name: '○○漁港', harbour: 'yes' } },
    ],
  };
  assert.deepEqual(parseOverpassResponse(json), [{ name: '○○漁港', lat: 34.5, lon: 133.5, tag: 'harbour=yes' }]);
});

test('parseOverpassResponse: name タグが無い要素は無視する', () => {
  const json = { elements: [{ type: 'node', lat: 1, lon: 1, tags: { natural: 'beach' } }] };
  assert.deepEqual(parseOverpassResponse(json), []);
});

test('parseOverpassResponse: center の無いwayは無視する', () => {
  const json = { elements: [{ type: 'way', tags: { name: 'X', harbour: 'yes' } }] };
  assert.deepEqual(parseOverpassResponse(json), []);
});

test('fetchOsmCandidates: 注入したfetchでPOSTし、レスポンスをパースする', async () => {
  let capturedUrl, capturedOptions;
  const fakeFetch = async (url, options) => {
    capturedUrl = url; capturedOptions = options;
    return {
      ok: true,
      json: async () => ({
        elements: [{ type: 'node', lat: 35.0, lon: 139.0, tags: { name: 'テスト港', harbour: 'yes' } }],
      }),
    };
  };
  const result = await fetchOsmCandidates({ fetchImpl: fakeFetch });
  assert.equal(capturedUrl, 'https://overpass-api.de/api/interpreter');
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.headers['User-Agent'], 'japan-tide-atlas static site builder');
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'テスト港');
});

test('fetchOsmCandidates: HTTPエラーは例外を投げる', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => fetchOsmCandidates({ fetchImpl: fakeFetch }), /503/);
});
