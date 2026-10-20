// Installation ownership is proved by a random server-local code, never by arrival order.
import fs from 'node:fs';
import crypto from 'node:crypto';
const digest = code => crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
export function initOwnerSetup(db, { enabled = false, codeFile } = {}) {
  if (!enabled || db.ownerSetup) return false;
  if (db.users.length) throw new Error('OWNER_SETUP requires an empty installation; existing admins can transfer rights in the dashboard');
  let code;
  try { code = fs.readFileSync(codeFile, 'utf8').trim(); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    code = crypto.randomBytes(32).toString('hex').toUpperCase();
    fs.writeFileSync(codeFile, code + '\n', { flag: 'wx', mode: 0o600 });
  }
  if (!/^[A-Fa-f0-9]{64}$/.test(code)) throw new Error('Invalid owner setup code file; expected 64 hexadecimal characters');
  db.ownerSetup = { hash: digest(code), created: new Date().toISOString() };
  return true;
}
export const ownerPending = db => !!db.ownerSetup && !db.ownerSetup.claimedBy;
export function ownerCodeMatches(db, code) {
  return !!db.ownerSetup?.hash && crypto.timingSafeEqual(Buffer.from(digest(code), 'hex'), Buffer.from(db.ownerSetup.hash, 'hex'));
}
export function claimOwner(db, user, code) {
  if (!ownerPending(db) || !ownerCodeMatches(db, code)) throw new Error('Owner setup code is invalid or already used');
  user.admin = true;
  db.ownerSetup.claimedBy = user.id;
  db.ownerSetup.claimedAt = new Date().toISOString();
}
