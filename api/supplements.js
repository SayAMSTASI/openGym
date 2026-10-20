import { nutritionLink } from './nutrition.js';
// Shared by the web UI and reminder worker. No browser, filesystem or third-party dependencies.
export const SUPPLEMENT_LIMIT = 100;
export const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const map = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
export function validDay(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function localClock(tz, at = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(at));
    const g = key => parts.find(p => p.type === key)?.value;
    const date = `${g('year')}-${g('month')}-${g('day')}`;
    return { date, hhmm: `${g('hour')}:${g('minute')}`, weekday: new Date(date + 'T12:00:00Z').getUTCDay() };
  } catch { return null; }
}
export function cleanSupplement(value, id = value?.id) {
  if (!ID_RE.test(id || '') || !value || typeof value !== 'object') return null;
  const name = str(value.name, 120);
  if (!name) return null;
  const times = [...new Set((Array.isArray(value.times) ? value.times : []).filter(t => typeof t === 'string' && TIME_RE.test(t)))].sort().slice(0, 8);
  const days = [...new Set((Array.isArray(value.days) ? value.days : [0, 1, 2, 3, 4, 5, 6]).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  return { id, name, dose: str(value.dose, 120), notes: str(value.notes, 2000), ingredientId: str(value.ingredientId, 80),
    times, days, tz: str(value.tz, 80), active: value.active !== false, reminder: value.reminder === true,
    start: validDay(value.start) ? value.start : '', end: validDay(value.end) ? value.end : '',
    nutrition: nutritionLink(value.nutrition), _ts: Number(value._ts) || 0 };
}
export function supplementsOf(S) {
  return Object.entries(map(S?.supplements)).slice(0, SUPPLEMENT_LIMIT).map(([id, s]) => cleanSupplement(s, id)).filter(Boolean);
}
export const intakeKey = (date, id, time) => `${date}|${id}|${time}`;
export function plannedOn(s, date) {
  if (!s?.active || !validDay(date) || (s.start && date < s.start) || (s.end && date > s.end)) return false;
  return s.days.includes(new Date(date + 'T12:00:00Z').getUTCDay());
}
export function intakesOn(S, date) {
  return supplementsOf(S).filter(s => plannedOn(s, date)).flatMap(s => s.times.map(time => {
    const key = intakeKey(date, s.id, time);
    const log = map(S?.supplementLog)[key];
    return { key, supplement: s, time, date, status: ['taken', 'skipped'].includes(log?.status) ? log.status : 'pending' };
  })).sort((a, b) => a.time.localeCompare(b.time) || a.supplement.name.localeCompare(b.supplement.name, 'ru'));
}
export function intakeRecord(s, date, time, status, at = Date.now()) {
  if (!validDay(date) || !TIME_RE.test(time) || !['taken', 'skipped', 'pending'].includes(status)) throw new Error('Invalid intake');
  return { supplementId: s.id, date, time, status, name: s.name, dose: s.dose, notes: s.notes, nutrition: nutritionLink(s.nutrition), _ts: at };
}
// A separate local clock for every supplement; workout settings and rest days never gate these.
// 15-minute same-day catch-up after a restart. The date-level key also suppresses DST duplicates.
export function supplementRemindersDue(S, sent = {}, at = Date.now()) {
  const due = [];
  for (const s of supplementsOf(S)) {
    if (!s.reminder || !s.active || !s.tz) continue;
    const now = localClock(s.tz, at);
    if (!now || !plannedOn(s, now.date)) continue;
    const minute = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    for (const time of s.times) {
      const key = intakeKey(now.date, s.id, time);
      const late = minute(now.hhmm) - minute(time);
      const status = map(S?.supplementLog)[key]?.status;
      if (late < 0 || late > 15 || sent[key] || status === 'taken' || status === 'skipped') continue;
      due.push({ key, supplement: s, date: now.date, time });
    }
  }
  return due;
}
export function supplementPush({ supplement: s, time }) {
  return { title: `Добавки · ${time}`, body: [s.name, s.dose, s.notes.slice(0, 240)].filter(Boolean).join(' · '),
    tag: `supplement-${s.id}-${time}`, route: '/supplements' };
}
export function pruneSupplementSent(sent, at = Date.now()) {
  // Keep at most three days, bounded even for state imported from an untrusted client.
  return Object.fromEntries(Object.entries(map(sent)).filter(([key, time]) => /^\d{4}-\d{2}-\d{2}\|[A-Za-z0-9_-]{1,80}\|\d{2}:\d{2}$/.test(key) && Number(time) >= at - 3 * 86400000).slice(-2400));
}
