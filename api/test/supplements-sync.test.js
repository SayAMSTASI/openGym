import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, stampChange, resetIdsOf } from '../../frontend/src/lib/sync-merge.js';
import { stampPut } from '../sync-stamps.js';

test('independent devices keep both schedules and daily logs instead of overwriting whole maps', () => {
  const base = { _ts: 100, routines: [], workouts: [], supplements: {}, supplementLog: {} };
  const a = structuredClone(base), b = structuredClone(base);
  a.supplements.a = { id: 'a', name: 'A', _ts: 101 };
  a.supplementLog['2026-10-20|a|09:00'] = { status: 'taken', _ts: 101 };
  a._ts = stampChange(base, a, 101);
  b.supplements.b = { id: 'b', name: 'B', _ts: 102 };
  b.supplementLog['2026-10-20|b|09:00'] = { status: 'skipped', _ts: 102 };
  b._ts = stampChange(base, b, 102);
  const merged = mergeStates(a, b);
  assert.deepEqual(Object.keys(merged.supplements).sort(), ['a', 'b']);
  assert.equal(Object.keys(merged.supplementLog).length, 2);
});
test('undo and pausing survive a newer unrelated save on an offline device', () => {
  const key = '2026-10-20|a|09:00';
  const a = { _ts: 10, supplements: { a: { active: true, _ts: 10 } }, supplementLog: { [key]: { status: 'taken', _ts: 10 } } };
  const b = structuredClone(a);
  b.supplements.a = { active: false, _ts: 20 };
  b.supplementLog[key] = { status: 'pending', _ts: 20 };
  b._ts = 20;
  a._ts = 100;
  const merged = mergeStates(a, b);
  assert.equal(merged.supplements.a.active, false);
  assert.equal(merged.supplementLog[key].status, 'pending');
  const ids = resetIdsOf(merged);
  assert.deepEqual(ids.supplements, ['a']);
  assert.deepEqual(ids.supplementLog, [key]);
});
test('a legacy writer that knows no supplements cannot erase them or their log', () => {
  const cur = { _ts: 10, supplements: { a: { name: 'A', _ts: 10 } }, supplementLog: {} };
  const next = structuredClone(cur);
  delete next.supplements;
  delete next.supplementLog;
  stampPut(cur, next, { overRead: true, now: 20 });
  assert.deepEqual(next.supplements, cur.supplements);
  assert.deepEqual(next.supplementLog, cur.supplementLog);
});
