// Overpass API から日本国内の名前付き沿岸施設(港湾/ビーチ/マリーナ/桟橋/釣りスポット等)を取得する。
//
// 全タグを1クエリにまとめると（area["ISO3166-1"="JP"]の解決コスト＋wayのcenter計算コストで）
// 公開Overpassサーバーでは180秒を超えてタイムアウトすることを実測で確認した。
// node系タグをまとめた1クエリ(bbox使用)でも、公開サーバー経由のプロキシが
// 504を返すことがあったため、最終的にタグ1つにつき1クエリまで分割している
// (実測: bboxを使えばタグ1つあたり10〜30秒程度で完了する)。

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

export function buildNodeQuery(tag) {
  return `[out:json][timeout:60][bbox:${BBOX}];
${tag};
out;`;
}

export function buildWayQuery(tag) {
  return `[out:json][timeout:60][bbox:${BBOX}];
${tag};
out center;`;
}

// 実行する個々のOverpassクエリの一覧。タグ1つにつき1本。
export function overpassQueries() {
  return [
    ...NODE_TAGS.map(tag => ({ label: tag, query: buildNodeQuery(tag) })),
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
// 1タグぶんのクエリがリトライしても失敗した場合、そのタグの候補は
// 諦めて残りのタグは続行する(公開Overpassサーバーの一時的な不調で
// パイプライン全体が止まるのを避けるため)。失敗したタグは onFailure で通知する。
export async function fetchOsmCandidates({ fetchImpl = fetch, queries = overpassQueries(), pauseMs = 2000, retryDelayMs = 5000, onProgress, onFailure } = {}) {
  const all = [];
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, pauseMs));
    try {
      const json = await runQuery(queries[i].query, { fetchImpl, retryDelayMs });
      const parsed = parseOverpassResponse(json);
      all.push(...parsed);
      if (onProgress) onProgress(queries[i].label, parsed.length, i + 1, queries.length);
    } catch (e) {
      if (onFailure) onFailure(queries[i].label, e, i + 1, queries.length);
    }
  }
  return all;
}
