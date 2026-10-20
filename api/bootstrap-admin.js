// Optional installation-time administrator. No universal password and no alternate login route.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { hashPassword, passwordProblem, nameKey } from './password.js';

export async function bootstrapAdmin(db, { enabled = false, passwordLogin = false, name = 'admin', passwordFile } = {}) {
  if (!enabled) return { created: false };
  if (!passwordLogin) throw new Error('BOOTSTRAP_ADMIN requires PASSWORD_LOGIN=1');
  if (!Array.isArray(db.users)) throw new Error('Invalid users database');
  // The marker also survives intentional account deletion: bootstrap must not become a backdoor.
  if (db.bootstrapAdminId) return { created: false, id: db.bootstrapAdminId };
  const login = String(name).trim();
  if (!login || login.length > 80) throw new Error('Invalid BOOTSTRAP_ADMIN_NAME');
  if (db.users.some(u => nameKey(u.name) === nameKey(login) || (u.email && nameKey(u.email) === nameKey(login)))) {
    throw new Error('Bootstrap admin name is already in use; refusing to change an existing account');
  }
  if (!passwordFile) throw new Error('Bootstrap password file is required');
  let password;
  try { password = fs.readFileSync(passwordFile, 'utf8').replace(/[\r\n]+$/, ''); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    password = crypto.randomBytes(24).toString('base64url');
    // Exclusive creation: an existing secret is never overwritten, even after a failed start.
    fs.writeFileSync(passwordFile, password + '\n', { flag: 'wx', mode: 0o600 });
  }
  if (passwordProblem(password)) throw new Error('Bootstrap password file does not meet password policy');
  const created = new Date().toISOString();
  const user = { id: crypto.randomBytes(12).toString('base64url'), name: login, created,
    admin: true, pw: { h: await hashPassword(password), set: created } };
  db.users.push(user);
  db.bootstrapAdminId = user.id;
  return { created: true, id: user.id };
}
