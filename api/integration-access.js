import crypto from 'node:crypto';
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
export function mintReadToken(user, name, days = 90, now = Date.now()) {
  if (![7, 30, 90, 365].includes(days)) throw new Error('Выберите срок 7, 30, 90 или 365 дней.');
  const token = 'gym_ro_' + crypto.randomBytes(32).toString('base64url');
  return { token, record: { id: crypto.randomBytes(12).toString('base64url'), userId: user.id, name: String(name || 'Codex').trim().slice(0, 60),
    hash: hash(token), scope: 'profile:read', sv: user.sv || 0, created: now, expires: now + days * 86400000 } };
}
export const publicReadToken = ({ id, name, scope, created, expires }) => ({ id, name, scope, created, expires });
export function resolveReadToken(db, token, now = Date.now()) {
  if (typeof token !== 'string' || !/^gym_ro_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const digest = Buffer.from(hash(token), 'hex');
  const record = (db.integrationTokens || []).find(t => typeof t.hash === 'string' && /^[a-f0-9]{64}$/.test(t.hash) && crypto.timingSafeEqual(digest, Buffer.from(t.hash, 'hex')));
  if (!record || record.expires <= now || record.scope !== 'profile:read') return null;
  const user = db.users.find(u => u.id === record.userId && !u.disabled);
  return user && (user.sv || 0) === record.sv ? { user, record } : null;
}
// Deliberate allowlist: no raw profile export, passkeys, sessions, API keys, photos or account data.
const FIELDS = ['unit', 'wdec', 'targetW', 'bodyweight', 'measurements', 'routines', 'workouts', 'week', 'dayPlan', 'customEx', 'exWeights', 'barWeights',
  'balanceOverrides', 'loadKind', 'plates', 'dbLoad', 'dumbbells', 'body', 'dayNotes', 'exNotes', 'logRef', 'startsFrom', 'queue', 'oneRmFormula',
  'nutritionFoods', 'nutritionRecipes', 'nutritionLog', 'nutritionGoals', 'supplements', 'supplementLog'];
export function integrationProfile(user, state, now = Date.now()) {
  const S = state || {};
  const selected = Object.fromEntries(FIELDS.filter(k => Object.hasOwn(S, k)).map(k => [k, S[k]]));
  const stripMedia = value => Array.isArray(value) ? value.map(stripMedia) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([k]) => !['media', 'photo', 'photos', 'video', 'videos', 'image', 'imageUrl', 'gif', 'gifUrl'].includes(k)).map(([k, v]) => [k, stripMedia(v)])) : value;
  return { user: { id: user.id, name: user.name, created: user.created || null }, state: state ? stripMedia(selected) : null,
    meta: { fetchedAt: now, lastSync: Number(S._ts) || null, scope: 'profile:read', readOnly: true } };
}
