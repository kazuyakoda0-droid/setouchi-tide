import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNodeQuery, buildWayQuery, overpassQueries, parseOverpassResponse, fetchOsmCandidates } from './osm-source.mjs';

test('buildNodeQuery: 指定したタグ1つだけのクエリを作る(bbox使用)', () => {
  const q = buildNodeQuery('node["natural"="beach"]["name"]');
  assert.match(q, /natural"="beach"/);
  assert.match(q, /\[bbox:24,122,46,146\]/);
  assert.match(q, /out;/);
});

test('buildWayQuery: 指定したタグ1つだけのcenterクエリを作る', () => {
  const q = buildWayQuery('way["harbour"]["name"]');
  assert.match(q, /way\["harbour"\]\["name"\]/);
  assert.match(q, /out center;/);
  assert.match(q, /\[bbox:24,122,46,146\]/);
});

test('overpassQueries: node系タグ+way系タグの数だけクエリを返す', () => {
  const qs = overpassQueries();
  const nodeQs = qs.filter(q => q.query.includes('out;'));
  const wayQs = qs.filter(q => q.query.includes('out center;'));
  assert.ok(nodeQs.length >= 7, `expected >=7 node queries, got ${nodeQs.length}`);
  assert.ok(wayQs.length >= 3, `expected >=3 way queries, got ${wayQs.length}`);
  assert.equal(qs.length, nodeQs.length + wayQs.length);
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

test('fetchOsmCandidates: 複数クエリを順番にPOSTし、結果を結合する', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    const idx = calls.length - 1;
    return {
      ok: true,
      json: async () => ({
        elements: [{ type: 'node', lat: 35.0 + idx, lon: 139.0, tags: { name: `テスト${idx}`, harbour: 'yes' } }],
      }),
    };
  };
  const fakeQueries = [{ label: 'a', query: 'QUERY_A' }, { label: 'b', query: 'QUERY_B' }];
  const progress = [];
  const result = await fetchOsmCandidates({
    fetchImpl: fakeFetch, queries: fakeQueries, pauseMs: 0,
    onProgress: (label, count, i, total) => progress.push({ label, count, i, total }),
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['User-Agent'], 'japan-tide-atlas static site builder');
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(r => r.name), ['テスト0', 'テスト1']);
  assert.deepEqual(progress, [
    { label: 'a', count: 1, i: 1, total: 2 },
    { label: 'b', count: 1, i: 2, total: 2 },
  ]);
});

test('fetchOsmCandidates: 1タグが3回リトライ後も失敗したら onFailure を呼び、他のタグは続行する', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls++;
    if (options.body === 'FAIL') return { ok: false, status: 503 };
    return {
      ok: true,
      json: async () => ({ elements: [{ type: 'node', lat: 1, lon: 1, tags: { name: 'OK', harbour: 'yes' } }] }),
    };
  };
  const failures = [];
  const result = await fetchOsmCandidates({
    fetchImpl: fakeFetch,
    queries: [{ label: 'bad', query: 'FAIL' }, { label: 'good', query: 'OK_QUERY' }],
    pauseMs: 0, retryDelayMs: 0,
    onFailure: (label, err, i, total) => failures.push({ label, i, total }),
  });
  assert.equal(calls, 10); // bad: 3 retries × 3 endpoints, good: 1
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'OK');
  assert.deepEqual(failures, [{ label: 'bad', i: 1, total: 2 }]);
});

test('fetchOsmCandidates: onFailureが無ければ静かに諦めて続行する', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503 });
  const result = await fetchOsmCandidates({
    fetchImpl: fakeFetch, queries: [{ label: 'a', query: 'Q' }], pauseMs: 0, retryDelayMs: 0,
  });
  assert.deepEqual(result, []);
});
