// =====================================================================
// 共通ユーティリティ（ビルド時・クライアント双方から使う純粋関数）
// =====================================================================

export const D2R = Math.PI / 180;
export const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const DAY = 86400000;

export function pad2(n) { return String(n).padStart(2, '0'); }
export function mod24(x) { x %= 24; if (x < 0) x += 24; return x; }
export function mod360(x) { return ((x % 360) + 360) % 360; }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// 小数時 → "HH:MM"
export function fmtHM(dec) {
  if (dec == null || isNaN(dec)) return '--:--';
  let h = Math.floor(dec);
  let m = Math.round((dec - h) * 60);
  if (m === 60) { m = 0; h += 1; }
  return pad2(h % 24) + ':' + pad2(m);
}

// 小数時 → "N時間MM分"
export function fmtDur(dec) {
  if (dec == null || isNaN(dec)) return '--';
  let h = Math.floor(dec);
  let m = Math.round((dec - h) * 60);
  if (m === 60) { m = 0; h += 1; }
  return h + '時間' + pad2(m) + '分';
}

// 十進度 → "DD°MM′N"
export function dms(v, pos, neg) {
  const dir = v >= 0 ? pos : neg;
  v = Math.abs(v);
  const dd = Math.floor(v);
  return dd + '°' + pad2(Math.round((v - dd) * 60)) + '′' + dir;
}

// JST の「今日」0:00 を UTC ミリ秒で表したもの。
// 日付計算はすべてこの「JSTの暦日を UTC の同じ数値で持つ」流儀で統一する。
export function todayJSTMs() {
  const j = new Date(Date.now() + 9 * 3600000);
  return Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate());
}

export function dayKeyOf(dayMs) {
  const d = new Date(dayMs);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

export function monthKeyOf(dayMs) {
  const d = new Date(dayMs);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1);
}

// 'YYYY-MM-DD' → UTC ミリ秒
export function dayMsOf(key) {
  const p = key.split('-').map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2]);
}

export function addDays(dayMs, n) { return dayMs + n * DAY; }

// 月をまたぐ加算。日は 1 に丸める。
export function addMonths(dayMs, n) {
  const d = new Date(dayMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
}

export function daysInMonth(y, m0) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

// 曜日色（土=青 / 日=赤 / 平日=標準）。CSS変数名を返す(リテラルの16進色に
// すると、ダークモードでも常に同じ色になってしまい背景と衝突するため)。
// 実際の色は style.css の :root / prefers-color-scheme:dark で定義する。
export function weekdayColor(wd) {
  return wd === 0 ? 'var(--red)' : wd === 6 ? 'var(--blue)' : 'var(--mut)';
}

// 潮名ごとの配色。同じ理由でCSS変数名を返す。
export const SHIO_STYLE = {
  大潮: { bg: 'var(--shio-oh-bg)', border: 'var(--shio-oh-bd)', color: 'var(--shio-oh-c)' },
  中潮: { bg: 'var(--shio-naka-bg)', border: 'var(--shio-naka-bd)', color: 'var(--shio-naka-c)' },
  小潮: { bg: 'var(--shio-ko-bg)', border: 'var(--shio-ko-bd)', color: 'var(--shio-ko-c)' },
  長潮: { bg: 'var(--shio-naga-bg)', border: 'var(--shio-naga-bd)', color: 'var(--shio-naga-c)' },
  若潮: { bg: 'var(--shio-waka-bg)', border: 'var(--shio-waka-bd)', color: 'var(--shio-waka-c)' },
};
