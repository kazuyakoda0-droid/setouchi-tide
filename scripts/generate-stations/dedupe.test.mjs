import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCandidates } from './dedupe.mjs';

test('mergeCandidates: 既存地点から近い候補は除外される', () => {
  const existing = [{ lat: 35.0, lon: 135.0 }];
  const candidates = [{ lat: 35.001, lon: 135.001, name: 'A' }]; // 約150m
  const { kept, excluded } = mergeCandidates(existing, candidates, 3);
  assert.equal(kept.length, 0);
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].reason, 'existing');
});

test('mergeCandidates: 十分離れた候補は残る', () => {
  const existing = [{ lat: 35.0, lon: 135.0 }];
  const candidates = [{ lat: 36.0, lon: 136.0, name: 'B' }];
  const { kept } = mergeCandidates(existing, candidates, 3);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].name, 'B');
});

test('mergeCandidates: 候補同士が近い場合は先勝ちで1件だけ残る', () => {
  const candidates = [
    { lat: 35.0, lon: 135.0, name: 'C1' },
    { lat: 35.0005, lon: 135.0005, name: 'C2' },
  ];
  const { kept, excluded } = mergeCandidates([], candidates, 3);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].name, 'C1');
  assert.equal(excluded[0].reason, 'duplicate');
});
