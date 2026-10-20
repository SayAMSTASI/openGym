import test from 'node:test';
import assert from 'node:assert/strict';
import { dayReminderPush, restTimerPush, testPush, nudgePush } from '../push-messages.js';

test('Russian rest and test notifications have localized text and stable routing tags', () => {
  assert.deepEqual(restTimerPush('ru'), {
    title: 'Отдых окончен 💪', body: 'Пора делать следующий подход.', tag: 'rest-timer',
  });
  assert.deepEqual(testPush('ru'), {
    title: 'openGym', body: 'Проверка уведомлений ✅ Так будут выглядеть оповещения.', tag: 'test',
  });
});

test('Russian reminders retain the routine name, including special replacement characters', () => {
  assert.equal(dayReminderPush('ru').title, 'Сегодня запланирована тренировка');
  const routine = { name: 'Спина $&', emoji: '🏋️' };
  const reminder = dayReminderPush('ru', routine);
  assert.equal(reminder.title, '🏋️ Спина $& — сегодня');
  assert.equal(reminder.tag, 'day-reminder');
  assert.match(reminder.body, /Тренировка/);
  const nudge = nudgePush('ru', 'friendly', routine, '2026-10-20');
  assert.ok(nudge.body.includes(routine.name));
  assert.ok(!nudge.body.includes('{0}'));
});
