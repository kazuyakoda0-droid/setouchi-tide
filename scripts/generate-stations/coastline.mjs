import { haversineKm } from './geo.mjs';

function outerRingsOf(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates.length ? [geometry.coordinates[0]] : [];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap(p => p.length ? [p[0]] : []);
  return [];
}

function keyOf(lon, lat) {
  return `${lon.toFixed(5)},${lat.toFixed(5)}`;
}

function segmentKey(a, b) {
  const x = keyOf(a[0], a[1]);
  const y = keyOf(b[0], b[1]);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

function interpolate(a, b, ratio) {
  return { lat: a[1] + (b[1] - a[1]) * ratio, lon: a[0] + (b[0] - a[0]) * ratio };
}

// Prefecture boundaries share a segment twice. Segments used once are outer
// coastlines (including islands); sampling them gives an honest, named
// fallback when the harbour data source is temporarily unavailable.
export function coastalCandidates(geoJSON, nameToId, prefs, { spacingKm = 10 } = {}) {
  const rings = [];
  const counts = new Map();
  for (const feature of geoJSON.features) {
    const pref = nameToId[feature.properties.P];
    if (!pref) continue;
    for (const ring of outerRingsOf(feature.geometry)) {
      rings.push({ pref, ring });
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        const key = segmentKey(a, b);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }

  const names = new Map(prefs.map(p => [p.id, p.name]));
  const counters = new Map();
  const candidates = [];
  for (const { pref, ring } of rings) {
    let carryKm = 0;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      if (counts.get(segmentKey(a, b)) !== 1) { carryKm = 0; continue; }
      const lengthKm = haversineKm({ lat: a[1], lon: a[0] }, { lat: b[1], lon: b[0] });
      if (lengthKm === 0) continue;
      let offsetKm = 0;
      while (carryKm + lengthKm - offsetKm >= spacingKm) {
        const neededKm = spacingKm - carryKm;
        offsetKm += neededKm;
        const point = interpolate(a, b, offsetKm / lengthKm);
        const no = (counters.get(pref) || 0) + 1;
        counters.set(pref, no);
        candidates.push({
          name: `${names.get(pref)}沿岸（補完${String(no).padStart(3, '0')}）`,
          ...point,
          pref,
          tag: 'coastline-fallback',
        });
        carryKm = 0;
      }
      carryKm += lengthKm - offsetKm;
    }
  }
  return candidates;
}
