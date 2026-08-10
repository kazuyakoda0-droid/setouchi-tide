// Overpass API から日本国内の名前付き沿岸施設(港湾/ビーチ/マリーナ/桟橋/釣りスポット等)を取得する。
//
// 全タグを1クエリにまとめると（area["ISO3166-1"="JP"]の解決コスト＋wayのcenter計算コストで）
// 公開Overpassサーバーでは180秒を超えてタイムアウトすることを実測で確認した。
// そのため bbox（日本全体の外接矩形）を使い、node系タグは1クエリにまとめ、
// center計算が重い way系タグはタグごとに個別クエリへ分割している。

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const BBOX = '24,122,46,146'; // 日本全体を覆う緯度経度の外接矩形（南,西,北,東）

const NODE_TAGS = [
  'node["natural"="beach"]["name"]',
  'node["leisure"="marina"]["name"]',
  'node["amenity"="ferry_terminal"]["name"]',
  'node["harbour"]["name"]',
  'node["seamark:type"="harbour"]["name"]',
  'node["man_made"="pier"]["name"]',
  'node["leisure"="fishing"]["name"]',
];

const WAY_TAGS = [
  'way["harbour"]["name"]',
  'way["seamark:type"="harbour"]["name"]',
  'way["man_made"="pier"]["name"]',
];

export function buildNodeQuery() {
  const body = NODE_TAGS.map(t => `${t};`).join('\n  ');
  return `[out:json][timeout:120][bbox:${BBOX}];
(
  ${body}
);
out;`;
}

export function buildWayQuery(tag) {
  return `[out:json][timeout:90][bbox:${BBOX}];
${tag};
out center;`;
}

// 実行する個々のOverpassクエリの一覧。node系1本＋way系タグごとに1本ずつ。
export function overpassQueries() {
  return [
    { label: 'nodes', query: buildNodeQuery() },
    ...WAY_TAGS.map(tag => ({ label: tag, query: buildWayQuery(tag) })),
  ];
}

// node は lat/lon を直接持つ。way は out center; の結果 element.center を使う。
export function parseOverpassResponse(json) {
  const out = [];
  for (const el of json.elements || []) {
    const name = el.tags && el.tags.name;
    if (!name) continue;
    let lat, lon;
    if (el.type === 'node') { lat = el.lat; lon = el.lon; }
    else if (el.type === 'way' && el.center) { lat = el.center.lat; lon = el.center.lon; }
    else continue;
    out.push({ name, lat, lon, tag: firstTagKey(el.tags) });
  }
  return out;
}

function firstTagKey(tags) {
  for (const k of ['natural', 'leisure', 'amenity', 'harbour', 'seamark:type', 'man_made']) {
    if (tags[k]) return `${k}=${tags[k]}`;
  }
  return 'unknown';
}

async function runQuery(query, { fetchImpl, retryDelayMs, attempt = 0 } = {}) {
  const res = await fetchImpl(OVERPASS_URL, {
    method: 'POST',
    headers: { 'User-Agent': 'japan-tide-atlas static site builder', 'Content-Type': 'text/plain' },
    body: query,
  });
  if (!res.ok) {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)));
      return runQuery(query, { fetchImpl, retryDelayMs, attempt: attempt + 1 });
    }
    throw new Error(`Overpass API の取得に失敗: HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.remark) {
    // "runtime error: Query timed out..." 等。要素0件のまま返すよりリトライする。
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)));
      return runQuery(query, { fetchImpl, retryDelayMs, attempt: attempt + 1 });
    }
    throw new Error(`Overpass API がエラーを返した: ${json.remark}`);
  }
  return json;
}

// 全クエリを順番に(同時実行せず)実行し、結果を1つの配列にまとめる。
// サーバに負荷をかけないよう、クエリ間・リトライ間に間隔を空ける。
export async function fetchOsmCandidates({ fetchImpl = fetch, queries = overpassQueries(), pauseMs = 3000, retryDelayMs = 5000 } = {}) {
  const all = [];
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, pauseMs));
    const json = await runQuery(queries[i].query, { fetchImpl, retryDelayMs });
    all.push(...parseOverpassResponse(json));
  }
  return all;
}
