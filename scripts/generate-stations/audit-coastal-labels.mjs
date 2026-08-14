// 国土地理院の逆ジオコーダで、沿岸補完地点を座標に対応する地名へ置き換えるための監査。
// 実行例: node scripts/generate-stations/audit-coastal-labels.mjs --out .cache/station-label-audit.json
import fs from 'node:fs';
import path from 'node:path';
import { TIDE_STATIONS, PREFS } from '../../lib/stations.mjs';
import { loadPrefectureGeoJSON, buildNameToId } from './prefectures.mjs';
import { pointInGeometry } from './geo.mjs';

const GSI_REVERSE = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress';
const GSI_MUNI = 'https://maps.gsi.go.jp/js/muni.js';
const outputAt = process.argv.indexOf('--out');
const output = outputAt >= 0 ? process.argv[outputAt + 1] : '.cache/station-label-audit.json';
const derivedNamedOnly = process.argv.includes('--derived-named');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function parseMunicipalities(source) {
  const municipalities = new Map();
  for (const match of source.matchAll(/GSI\.MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g)) {
    const [, code, value] = match;
    const [, prefecture, , city] = value.split(',');
    municipalities.set(String(Number(code)), { prefecture: prefecture.replace(/\s/g, ''), city: city.replace(/\s/g, '') });
  }
  return municipalities;
}

function cleanLocalName(name) {
  const local = (name || '').replace(/^(?:大字|字)/, '').trim();
  return /^[\-−ー]*$/.test(local) ? '' : local;
}

function labelOf(result, municipalities) {
  if (!result?.muniCd) return null;
  const municipality = municipalities.get(String(Number(result.muniCd)))?.city || '';
  const local = cleanLocalName(result.lv01Nm);
  if (!municipality && !local) return null;
  if (!municipality || !local || municipality.includes(local)) return municipality || local;
  return `${municipality}（${local}）`;
}

function offset(point, bearing, km) {
  const rad = bearing * Math.PI / 180;
  return {
    lat: point.lat + Math.cos(rad) * km / 111.32,
    lon: point.lon + Math.sin(rad) * km / (111.32 * Math.cos(point.lat * Math.PI / 180)),
  };
}

async function main() {
  const [municipalityRes, geoJSON] = await Promise.all([
    fetch(GSI_MUNI),
    loadPrefectureGeoJSON(),
  ]);
  if (!municipalityRes.ok) throw new Error(`市区町村コード表の取得に失敗: HTTP ${municipalityRes.status}`);
  const municipalities = parseMunicipalities(await municipalityRes.text());
  const nameToId = buildNameToId(PREFS);
  const prefectures = new Map(geoJSON.features.map(f => [nameToId[f.properties.P], f.geometry]));
  const isSupplement = st => /沿岸（補完\d+）$/.test(st.name);
  const targets = derivedNamedOnly
    ? TIDE_STATIONS.filter(st => st.jmaAnchor && !isSupplement(st))
    : TIDE_STATIONS.filter(isSupplement);
  const results = [];

  async function reverse(point) {
    const url = `${GSI_REVERSE}?lat=${encodeURIComponent(point.lat)}&lon=${encodeURIComponent(point.lon)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`逆ジオコーダの取得に失敗: HTTP ${res.status}`);
    return (await res.json()).results || null;
  }

  for (let i = 0; i < targets.length; i++) {
    const st = targets[i];
    const probes = [{ lat: st.lat, lon: st.lon, source: 'point' }];
    const geometry = prefectures.get(st.pref);
    for (const km of [0.5, 1.5]) {
      for (let bearing = 0; bearing < 360; bearing += 45) {
        const point = offset(st, bearing, km);
        if (geometry && pointInGeometry(point.lat, point.lon, geometry)) probes.push({ ...point, source: `inland-${km}km` });
      }
    }

    let found = null, probe = null;
    for (const candidate of probes) {
      const result = await reverse(candidate);
      await sleep(180);
      if (labelOf(result, municipalities)) { found = result; probe = candidate; break; }
    }
    results.push({
      id: st.id,
      oldName: st.name,
      jmaAnchor: st.jmaAnchor,
      lat: st.lat,
      lon: st.lon,
      pref: st.pref,
      label: labelOf(found, municipalities),
      muniCode: found?.muniCd ? String(Number(found.muniCd)) : null,
      sourcePrefecture: found?.muniCd ? municipalities.get(String(Number(found.muniCd)))?.prefecture || null : null,
      municipality: found?.muniCd ? municipalities.get(String(Number(found.muniCd)))?.city || null : null,
      locality: cleanLocalName(found?.lv01Nm),
      source: probe?.source || null,
    });
    if ((i + 1) % 25 === 0 || i + 1 === targets.length) console.log(`逆ジオコード ${i + 1}/${targets.length}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: '国土地理院リバースジオコーダAPI',
    total: results.length,
    resolved: results.filter(r => r.label).length,
    unresolved: results.filter(r => !r.label).map(r => r.id),
    results,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`完了: ${report.resolved}/${report.total} 地点に地名を付与 (${output})`);
}

main().catch(error => { console.error(error); process.exit(1); });
