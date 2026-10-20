import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSupplement, intakesOn, intakeKey, intakeRecord, localClock, supplementRemindersDue, supplementPush, pruneSupplementSent, validDay } from '../supplements.js';
import { notificationOrigin } from '../../frontend/src/lib/notification-origin.js';
import fs from 'node:fs';
const at = Date.parse('2026-10-20T06:03:00Z');
const s = over => cleanSupplement({ id: 'creatine1', name: 'Тестовая добавка', dose: 'Моя порция', notes: 'Описание $&', times: ['09:00', '18:00'], days: [0, 1, 2, 3, 4, 5, 6], tz: 'Europe/Moscow', reminder: true, ...over });
const state = over => ({ supplements: { creatine1: s() }, reminder: { on: false }, ...over });

test('scheduled reminders follow the supplement zone on rest days with workout reminders off', () => {
  const due = supplementRemindersDue(state(), {}, at);
  assert.equal(due.length, 1);
  assert.equal(due[0].time, '09:00');
  assert.equal(due[0].date, '2026-10-20');
  assert.equal(localClock('Europe/Moscow', at).hhmm, '09:03');
  assert.equal(localClock('Invalid/Zone', at), null);
});
test('catch-up is limited to 15 minutes, never before time or across midnight', () => {
  const S = state();
  assert.equal(supplementRemindersDue(S, {}, Date.parse('2026-10-20T05:59Z')).length, 0);
  assert.equal(supplementRemindersDue(S, {}, Date.parse('2026-10-20T06:15Z')).length, 1);
  assert.equal(supplementRemindersDue(S, {}, Date.parse('2026-10-20T06:16Z')).length, 0);
  assert.equal(supplementRemindersDue(state({ supplements: { creatine1: s({ times: ['23:55'] }) } }), {}, Date.parse('2026-10-20T21:05Z')).length, 0);
});
test('taken, skipped and already sent reminders stay silent; undo remains a stamped pending record', () => {
  const key = intakeKey('2026-10-20', 'creatine1', '09:00');
  for (const status of ['taken', 'skipped']) assert.equal(supplementRemindersDue(state({ supplementLog: { [key]: { status } } }), {}, at).length, 0);
  assert.equal(supplementRemindersDue(state(), { [key]: at }, at).length, 0);
  assert.equal(supplementRemindersDue(state({ supplementLog: { [key]: { status: 'pending' } } }), {}, at).length, 1);
});
test('days, course boundaries, pauses and per-supplement reminder switches are independent', () => {
  for (const over of [{ days: [1] }, { start: '2026-10-21' }, { end: '2026-10-19' }, { active: false }, { reminder: false }, { tz: 'broken' }]) {
    assert.equal(supplementRemindersDue(state({ supplements: { creatine1: s(over) } }), {}, at).length, 0, JSON.stringify(over));
  }
  assert.equal(supplementRemindersDue(state({ supplements: { creatine1: s({ start: '2026-10-20', end: '2026-10-20' }) } }), {}, at).length, 1);
});
test('each daily time is its own intake and history preserves the old description after edits', () => {
  const S = state();
  const old = intakeRecord(s(), '2026-10-20', '09:00', 'taken', at);
  S.supplementLog = { [intakeKey('2026-10-20', 'creatine1', '09:00')]: old };
  S.supplements.creatine1.notes = 'Новое описание';
  assert.deepEqual(intakesOn(S, '2026-10-20').map(x => x.status), ['taken', 'pending']);
  assert.equal(old.notes, 'Описание $&');
  assert.deepEqual(intakesOn(S, '2026-10-21').map(x => x.status), ['pending', 'pending']);
});
test('DST repeated hour does not duplicate an intake; invalid imports are bounded and ignored', () => {
  const S = { supplements: { a: s({ id: 'a', times: ['02:30'], tz: 'Europe/Berlin' }) } };
  const first = supplementRemindersDue(S, {}, Date.parse('2026-10-25T00:30Z'))[0];
  assert.ok(first);
  assert.equal(supplementRemindersDue(S, { [first.key]: at }, Date.parse('2026-10-25T01:30Z')).length, 0);
  assert.equal(supplementRemindersDue({ supplements: [null, 1] }, {}, at).length, 0);
  assert.equal(supplementRemindersDue({ supplements: { x: 'bad', y: null } }, {}, at).length, 0);
  assert.deepEqual(s({ times: ['25:00', '08:00', '08:00', null] }).times, ['08:00']);
  assert.ok(!validDay('2026-02-30'));
  assert.ok(!validDay('2026-10-20junk'));
});
test('notification includes only the scheduled description and routes to the supplement tab', () => {
  const payload = supplementPush(supplementRemindersDue(state(), {}, at)[0]);
  assert.equal(payload.route, '/supplements');
  assert.match(payload.body, /Описание \$&/);
  assert.equal(payload.tag, 'supplement-creatine1-09:00');
  assert.ok(!JSON.stringify(payload).includes('supplementLog'));
  assert.deepEqual(pruneSupplementSent({ bad: at, '2026-10-20|a|09:00': at, '2026-10-01|b|09:00': at - 9e8 }, at), { '2026-10-20|a|09:00': at });
});
test('offline reference is complete, locally described and honest about the unfinished source', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../../frontend/src/lib/nutritabl-catalogue.json', import.meta.url), 'utf8'));
  assert.equal(data.items.length, 109);
  assert.equal(new Set(data.items.map(x => x.id)).size, 109);
  for (const x of data.items) {
    assert.ok(x.summary.length > 80, x.id);
    assert.match(x.url, /^https:\/\/nutritabl\.com\/ru\/ingredients\/[a-z0-9-]+\/$/);
  }
  assert.deepEqual(data.items.filter(x => x.draft).map(x => x.id), ['tyrosine']);
});
test('notifications permit localhost but keep plain LAN HTTP excluded', () => {
  assert.ok(notificationOrigin({ protocol: 'https:', hostname: 'gym.test' }));
  assert.ok(notificationOrigin({ protocol: 'http:', hostname: 'localhost' }, true));
  assert.ok(!notificationOrigin({ protocol: 'http:', hostname: '192.168.1.2' }, true));
  assert.ok(!notificationOrigin({ protocol: 'https:', hostname: 'gym.test' }, false));
});
