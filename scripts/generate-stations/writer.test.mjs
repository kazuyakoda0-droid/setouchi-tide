import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStationLine, groupByPrefecture, insertIntoStationsFile } from './writer.mjs';

const ENTRY = {
  id: 'n0001', name: 'テスト浜', lat: 35.12345, lon: 139.6789,
  pref: 'tokyo', jma: 'TK', jmaAnchor: true, damp: 1.00, dz: 0, dphase: 0.00, model: null,
};

test('formatStationLine: 既存フォーマットと同じ構造の行を生成する', () => {
  const line = formatStationLine(ENTRY);
  assert.equal(
    line,
    "  { id:'n0001', name:'テスト浜', kana:'', lat:35.1234, lon:139.6789, pref:'tokyo', jma:'TK', jmaAnchor:true, damp:1.00, dz:0, dphase:0.00, model:null },"
  );
});

test('groupByPrefecture: PREFSの順序でMapを作る', () => {
  const PREFS = [{ id: 'tokyo', name: '東京都' }, { id: 'osaka', name: '大阪府' }];
  const grouped = groupByPrefecture([ENTRY], PREFS);
  assert.deepEqual([...grouped.keys()], ['tokyo', 'osaka']);
  assert.equal(grouped.get('tokyo').length, 1);
  assert.equal(grouped.get('osaka').length, 0);
});

test('groupByPrefecture: 未知の都道府県IDは例外', () => {
  const PREFS = [{ id: 'tokyo', name: '東京都' }];
  assert.throws(() => groupByPrefecture([{ ...ENTRY, pref: 'nowhere' }], PREFS));
});

test('insertIntoStationsFile: 配列終端の直前に新規ブロックを挿入する', () => {
  const PREFS = [{ id: 'tokyo', name: '東京都' }];
  const fileText = `const TIDE_STATIONS = [
  { id:'jma_tk', name:'東京', kana:'', lat:35.0, lon:139.0, pref:'tokyo', jma:'TK', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },
];

// 気象庁観測点コード → 表示名
const JMA_STN_NAME = {};
`;
  const result = insertIntoStationsFile(fileText, [ENTRY], PREFS, '2026-08-11');
  assert.match(result, /新規地点（自動生成 2026-08-11 追加）/);
  assert.match(result, /n0001/);
  assert.match(result, /jma_tk/);
  assert.ok(result.indexOf('n0001') < result.indexOf('];'));
});

test('insertIntoStationsFile: アンカー文字列が無いと例外', () => {
  assert.throws(() => insertIntoStationsFile('broken file', [ENTRY], [{ id: 'tokyo', name: '東京都' }], '2026-08-11'));
});

test('insertIntoStationsFile: CRLFのファイルでもアンカーを見つけ、CRLFで挿入する', () => {
  const PREFS = [{ id: 'tokyo', name: '東京都' }];
  const fileText = `const TIDE_STATIONS = [\r\n`
    + `  { id:'jma_tk', name:'東京', kana:'', lat:35.0, lon:139.0, pref:'tokyo', jma:'TK', jmaAnchor:false, damp:1.00, dz:0, dphase:0.00, model:null },\r\n`
    + `];\r\n\r\n`
    + `// 気象庁観測点コード → 表示名\r\n`
    + `const JMA_STN_NAME = {};\r\n`;
  const result = insertIntoStationsFile(fileText, [ENTRY], PREFS, '2026-08-11');
  assert.match(result, /新規地点（自動生成 2026-08-11 追加）[^\r\n]*\r\n/);
  assert.match(result, /n0001[^\r\n]*\},\r\n/);
  assert.ok(result.indexOf('n0001') < result.indexOf('];'));
});
