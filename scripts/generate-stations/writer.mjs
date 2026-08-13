// 生成した新規地点を lib/stations.mjs に追記する。
//
// Windows(git core.autocrlf)でチェックアウトすると改行がCRLFになるため、
// アンカー検索は \r? を許容し、挿入する行の改行も既存ファイルに合わせる。

const ARRAY_CLOSE_ANCHOR = /\];\r?\n\r?\n\/\/ 気象庁観測点コード → 表示名/;

export function formatStationLine(entry) {
  const lat = Number(entry.lat.toFixed(4));
  const lon = Number(entry.lon.toFixed(4));
  const model = entry.model === null ? 'null' : `'${entry.model}'`;
  const quality = entry.approxQuality ? `, approxQuality:'${entry.approxQuality}'` : '';
  return `  { id:'${entry.id}', name:'${entry.name}', kana:'', lat:${lat}, lon:${lon}, pref:'${entry.pref}', jma:'${entry.jma}', jmaAnchor:${entry.jmaAnchor}, damp:${entry.damp.toFixed(2)}, dz:${entry.dz}, dphase:${entry.dphase.toFixed(2)}, model:${model}${quality} },`;
}

// PREFS の順序どおりに { prefId: entry[] } へグルーピングする。
export function groupByPrefecture(entries, PREFS) {
  const byId = new Map(PREFS.map(p => [p.id, []]));
  for (const e of entries) {
    if (!byId.has(e.pref)) throw new Error(`未知の都道府県ID: ${e.pref}`);
    byId.get(e.pref).push(e);
  }
  return byId;
}

// existingFileText の TIDE_STATIONS 配列末尾（`];` の直前）に新規地点ブロックを挿入する。
export function insertIntoStationsFile(existingFileText, entries, PREFS, dateStr) {
  const match = ARRAY_CLOSE_ANCHOR.exec(existingFileText);
  if (!match) {
    throw new Error('TIDE_STATIONS 配列の終端が見つかりません。stations.mjs のフォーマットが変わっていないか確認してください。');
  }
  const anchorIndex = match.index;
  const eol = existingFileText.includes('\r\n') ? '\r\n' : '\n';

  const grouped = groupByPrefecture(entries, PREFS);
  const lines = [`  // ---------- 新規地点（自動生成 ${dateStr} 追加） ----------`];
  for (const pref of PREFS) {
    const list = grouped.get(pref.id);
    if (!list || list.length === 0) continue;
    lines.push(`  // ---------- ${pref.name} ----------`);
    for (const e of list) lines.push(formatStationLine(e));
  }

  const insertion = lines.join(eol) + eol;
  return existingFileText.slice(0, anchorIndex) + insertion + existingFileText.slice(anchorIndex);
}
