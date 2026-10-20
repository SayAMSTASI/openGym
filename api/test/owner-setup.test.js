import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initOwnerSetup, ownerPending, ownerCodeMatches, claimOwner } from '../owner-setup.js';
test('owner setup persists across restarts and never reopens after a transfer or account deletion', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-owner-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const opts = { enabled: true, codeFile: path.join(dir, 'code') }, db = { users: [] };
  assert.equal(initOwnerSetup(db, opts), true);
  const code = fs.readFileSync(opts.codeFile, 'utf8').trim();
  assert.equal(code.length, 64); assert.ok(ownerPending(db));
  assert.equal(ownerCodeMatches(db, 'bad'), false);
  const restored = JSON.parse(JSON.stringify(db));
  assert.equal(initOwnerSetup(restored, opts), false);
  assert.ok(ownerCodeMatches(restored, code.toLowerCase()));
  assert.throws(() => claimOwner(restored, { id: 'bad' }, 'bad'));
  const owner = { id: 'fixture' }; claimOwner(restored, owner, code);
  assert.equal(owner.admin, true); assert.equal(ownerPending(restored), false);
  assert.equal(initOwnerSetup(restored, opts), false);
  assert.throws(() => claimOwner(restored, { id: 'reuse' }, code));
  assert.ok(!JSON.stringify(restored).includes(code));
});
test('setup refuses to replace an established installation', () => {
  assert.throws(() => initOwnerSetup({ users: [{ id: 'existing' }] }, { enabled: true }), /empty installation/);
});
