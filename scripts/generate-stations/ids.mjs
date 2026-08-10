// 既存ID('jma_xx', 'p001'...)と衝突しない新規IDを 'n0001' 形式でまとめて発番する。
export function assignIds(existingIds, count) {
  const existing = new Set(existingIds);
  const ids = [];
  let n = 1;
  while (ids.length < count) {
    const id = 'n' + String(n).padStart(4, '0');
    if (!existing.has(id)) { ids.push(id); existing.add(id); }
    n++;
  }
  return ids;
}
