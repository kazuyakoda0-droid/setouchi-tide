// Overpass API から日本国内の名前付き沿岸施設(港湾/ビーチ/マリーナ/桟橋/釣りスポット等)を取得する。

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const TAGS = [
  'node["natural"="beach"]["name"]',
  'node["leisure"="marina"]["name"]',
  'node["amenity"="ferry_terminal"]["name"]',
  'node["harbour"]["name"]',
  'way["harbour"]["name"]',
  'node["seamark:type"="harbour"]["name"]',
  'way["seamark:type"="harbour"]["name"]',
  'node["man_made"="pier"]["name"]',
  'way["man_made"="pier"]["name"]',
  'node["leisure"="fishing"]["name"]',
];

export function buildOverpassQuery() {
  const body = TAGS.map(t => `${t}(area.jp);`).join('\n  ');
  return `[out:json][timeout:180];
area["ISO3166-1"="JP"][admin_level=2]->.jp;
(
  ${body}
);
out center;`;
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

export async function fetchOsmCandidates({ fetchImpl = fetch } = {}) {
  const query = buildOverpassQuery();
  const res = await fetchImpl(OVERPASS_URL, {
    method: 'POST',
    headers: { 'User-Agent': 'japan-tide-atlas static site builder', 'Content-Type': 'text/plain' },
    body: query,
  });
  if (!res.ok) throw new Error(`Overpass API の取得に失敗: HTTP ${res.status}`);
  const json = await res.json();
  return parseOverpassResponse(json);
}
