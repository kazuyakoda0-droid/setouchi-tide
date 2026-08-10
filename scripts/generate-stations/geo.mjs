// 純粋な幾何計算: 2点間の距離(km)と点-in-polygon判定。外部依存なし。

export function haversineKm(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ring: [[lon,lat], [lon,lat], ...]（GeoJSON順序 = 経度が先）
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersects = (yi > lat) !== (yj > lat)
      && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// polygonCoords: GeoJSON Polygon の coordinates（[外周, 穴1, 穴2, ...]）
function pointInPolygonCoords(lon, lat, polygonCoords) {
  if (!pointInRing(lon, lat, polygonCoords[0])) return false;
  for (let i = 1; i < polygonCoords.length; i++) {
    if (pointInRing(lon, lat, polygonCoords[i])) return false; // 穴の中
  }
  return true;
}

export function pointInGeometry(lat, lon, geometry) {
  if (geometry.type === 'Polygon') {
    return pointInPolygonCoords(lon, lat, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(poly => pointInPolygonCoords(lon, lat, poly));
  }
  return false;
}
