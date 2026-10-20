import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootstrapAdmin } from '../bootstrap-admin.js';
import { hashPassword, verifyPassword } from '../password.js';
const setup = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-admin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { db: { users: [] }, options: { enabled: true, passwordLogin: true, passwordFile: path.join(dir, 'password') } };
};
test('installation creates an administrator with a unique password and ordinary password hash', async t => {
  const { db, options } = setup(t);
  const result = await bootstrapAdmin(db, options);
  assert.equal(result.created, true);
  assert.equal(db.users.length, 1);
  const user = db.users[0], password = fs.readFileSync(options.passwordFile, 'utf8').trimEnd();
  assert.equal(user.name, 'admin'); assert.equal(user.admin, true);
  assert.ok(password.length >= 24);
  assert.equal(await verifyPassword(password, user.pw.h), true);
  assert.ok(!JSON.stringify(db).includes(password));
  assert.equal(db.bootstrapAdminId, user.id);
});
test('restart preserves changed passwords, credentials and state without needing the initial secret', async t => {
  const { db, options } = setup(t);
  await bootstrapAdmin(db, options);
  db.users[0].pw.h = await hashPassword('A new personal password!');
  const snapshot = JSON.stringify(db);
  fs.unlinkSync(options.passwordFile);
  assert.equal((await bootstrapAdmin(db, options)).created, false);
  assert.equal(JSON.stringify(db), snapshot);
  assert.equal(fs.existsSync(options.passwordFile), false);
});
test('an existing account or e-mail is never promoted, overwritten or assigned another password', async t => {
  const { db, options } = setup(t);
  for (const user of [{ name: 'ADMIN', admin: false }, { name: 'Someone', email: 'admin', admin: false }]) {
    db.users = [user];
    await assert.rejects(bootstrapAdmin(db, options), /already in use/);
    assert.equal(db.users.length, 1); assert.equal(user.admin, false);
    assert.equal(fs.existsSync(options.passwordFile), false);
  }
});
test('deleting the installation account does not silently recreate administrator access', async t => {
  const { db, options } = setup(t);
  await bootstrapAdmin(db, options); db.users = [];
  assert.equal((await bootstrapAdmin(db, options)).created, false);
  assert.equal(db.users.length, 0);
});
test('off by default, requires password login, and rejects a weak supplied secret', async t => {
  const { db, options } = setup(t);
  assert.equal((await bootstrapAdmin(db)).created, false);
  await assert.rejects(bootstrapAdmin(db, { ...options, passwordLogin: false }), /PASSWORD_LOGIN/);
  fs.writeFileSync(options.passwordFile, 'short');
  await assert.rejects(bootstrapAdmin(db, options), /password policy/);
  assert.equal(db.users.length, 0);
});
