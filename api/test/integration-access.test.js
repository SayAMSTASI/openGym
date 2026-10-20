import test from 'node:test';
import assert from 'node:assert/strict';
import { mintReadToken, resolveReadToken, integrationProfile, publicReadToken } from '../integration-access.js';
test('profile keys are hashed, scoped, expire, and follow owner revocation and disable state', () => {
  const user = { id: 'a', sv: 3, name: 'A' }, other = { id: 'b', name: 'B' };
  const { token, record } = mintReadToken(user, 'Codex', 7, 100);
  const db = { users: [user, other], integrationTokens: [record] };
  assert.equal(resolveReadToken(db, token, 101).user.id, 'a');
  assert.ok(!JSON.stringify(db).includes(token));
  assert.ok(!Object.hasOwn(publicReadToken(record), 'hash'));
  assert.equal(resolveReadToken(db, token + 'x', 101), null);
  assert.equal(resolveReadToken(db, token, record.expires), null);
  user.disabled = true; assert.equal(resolveReadToken(db, token, 101), null);
  user.disabled = false; user.sv++; assert.equal(resolveReadToken(db, token, 101), null);
  user.sv--; db.integrationTokens = []; assert.equal(resolveReadToken(db, token, 101), null);
  assert.throws(() => mintReadToken(user, 'bad', 0));
});
test('profile export never includes account secrets, coach keys or media', () => {
  const result = integrationProfile({ id: 'a', name: 'A', pw: { h: 'PASSWORD' }, email: 'PRIVATE' }, {
    _ts: 10, workouts: [{ id: 'w', d: '2026-10-20', entries: [{ media: 'PRIVATE_IMAGE' }], media: ['PRIVATE_VIDEO'] }],
    nutritionGoals: { daily: { protein: 100 } }, supplements: {}, coach: { apiKey: 'KEY' }, session: 'SESSION'
  });
  const output = JSON.stringify(result);
  for (const secret of ['PASSWORD', 'PRIVATE', 'KEY', 'SESSION']) assert.ok(!output.includes(secret));
  assert.equal(result.state.nutritionGoals.daily.protein, 100);
  assert.equal(result.meta.lastSync, 10);
});
