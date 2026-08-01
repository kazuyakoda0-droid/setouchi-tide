// =====================================================================
// 共通ユーティリティ
// 他のモジュールより先に読み込むこと。
// =====================================================================

const D2R = Math.PI / 180;
const WD = ['日', '月', '火', '水', '木', '金', '土'];

function pad2(n) { return String(n).padStart(2, '0'); }
function mod24(x) { x %= 24; if (x < 0) x += 24; return x; }
function mod360(x) { return ((x % 360) + 360) % 360; }

// 小数時 → "HH:MM"
function fmtHM(dec) {
  if (dec == null || isNaN(dec)) return '--:--';
  let h = Math.floor(dec);
  let m = Math.round((dec - h) * 60);
  if (m === 60) { m = 0; h += 1; }
  return pad2(h % 24) + ':' + pad2(m);
}

// 小数時 → "N時間MM分"
function fmtDur(dec) {
  if (dec == null || isNaN(dec)) return '--';
  let h = Math.floor(dec);
  let m = Math.round((dec - h) * 60);
  if (m === 60) { m = 0; h += 1; }
  return h + '時間' + pad2(m) + '分';
}

// 十進度 → "DD°MM′N" 形式
function dms(v, pos, neg) {
  const dir = v >= 0 ? pos : neg;
  v = Math.abs(v);
  const dd = Math.floor(v);
  const mm = Math.round((v - dd) * 60);
  return dd + '°' + pad2(mm) + '′' + dir;
}

// #rrggbb + アルファ → rgba()
function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

// JST の「今日」の 0:00 を UTC ミリ秒で返す
function todayJSTMs() {
  const n = new Date();
  const j = new Date(n.getTime() + 9 * 3600000);
  return Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate());
}

// 日付ミリ秒 → 通日インデックス(キャッシュキー用)
function dayIndex(dayMs) { return Math.floor(dayMs / 86400000); }

// 日付ミリ秒 → 'YYYY-MM-DD'
function dayKeyOf(dayMs) {
  const d = new Date(dayMs);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

// localStorage を使うキャッシュ。容量超過時は静かに諦める(キャッシュなしで継続)。
function makeStore(key, maxEntries) {
  let mem;
  try { mem = JSON.parse(localStorage.getItem(key)) || {}; }
  catch (e) { mem = {}; }

  return {
    get(k) {
      const v = mem[k];
      if (v) v._t = Date.now();
      return v;
    },
    set(k, v) {
      mem[k] = Object.assign({}, v, { _t: Date.now() });
    },
    has(k) { return Object.prototype.hasOwnProperty.call(mem, k); },
    // 古いものから間引いて保存
    flush() {
      const keys = Object.keys(mem);
      if (keys.length > maxEntries) {
        keys.sort((a, b) => (mem[a]._t || 0) - (mem[b]._t || 0));
        for (let i = 0; i < keys.length - maxEntries; i++) delete mem[keys[i]];
      }
      try { localStorage.setItem(key, JSON.stringify(mem)); }
      catch (e) { /* 容量超過等は無視 */ }
    },
  };
}
