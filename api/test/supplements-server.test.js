import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { localClock, intakeKey } from '../supplements.js';
const API = fileURLToPath(new URL('..', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('real scheduler sends description with training reminders off, persists dedupe and honors completion', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-supplement-'));
  const capture = path.join(dir, 'delivered.jsonl');
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  const db = { users: [{ id: 'u_supp', name: 'Fixture' }], creds: [], subs: [{ userId: 'u_supp', endpoint: 'https://push.example.test/supp', keys: { p256dh: 'fixture', auth: 'fixture' } }], invites: [] };
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(db));
  const now = localClock('UTC');
  const supplement = { id: 's1', name: 'Тестовое название', dose: 'Тестовая порция', notes: 'Тестовое описание', times: [now.hhmm], tz: 'UTC', days: [0, 1, 2, 3, 4, 5, 6], reminder: true, active: true, _ts: Date.now() };
  const key = intakeKey(now.date, supplement.id, now.hhmm);
  fs.writeFileSync(path.join(dir, 'state-u_supp.json'), JSON.stringify({ _ts: Date.now(), supplements: { s1: supplement }, supplementLog: {}, reminder: { on: false }, workouts: [], routines: [] }));
  let child;
  t.after(async () => { if (child && child.exitCode === null) { child.kill('SIGKILL'); await new Promise(r => child.once('exit', r)); } fs.rmSync(dir, { recursive: true, force: true }); });
  const start = async () => {
    let log = '';
    child = spawn(process.execPath, ['--import', './test/supplement-push-fixture.mjs', 'server.js'], { cwd: API,
      env: { ...process.env, PORT: '0', DATA_DIR: dir, ORIGIN: 'http://localhost:8080', REMINDER_TICK_MS: '100', TEST_SUPPLEMENT_CAPTURE: capture }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => { log += b }); child.stderr.on('data', b => { log += b });
    const port = await boundPort(child, () => log);
    return `http://127.0.0.1:${port}`;
  };
  const read = () => { try { return fs.readFileSync(capture, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) } catch { return [] } };
  let api = await start();
  const until = Date.now() + 5000;
  while (!read().length && Date.now() < until) await delay(100);
  assert.equal(read().length, 1);
  assert.match(read()[0].payload.body, /Тестовое название · Тестовая порция · Тестовое описание/);
  assert.equal(read()[0].payload.route, '/supplements');
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'db.json'))).users[0].supplementSent[key]);
  child.kill('SIGKILL'); await new Promise(r => child.once('exit', r));
  api = await start();
  await delay(400);
  assert.equal(read().length, 1, 'no duplicate after an API restart');

  const payload = `u_supp:${Date.now() + 86400000}:0`;
  const cookie = payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const second = { ...supplement, id: 's2', name: 'Уже принято' };
  const put = await fetch(api + '/api/data', { method: 'PUT', headers: { Cookie: 'gymsid=' + cookie, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }, body: JSON.stringify({ stamped: true, state: { _ts: Date.now(), routines: [], workouts: [], supplements: { s1: supplement, s2: second }, supplementLog: { [intakeKey(now.date, 's2', now.hhmm)]: { status: 'taken', _ts: Date.now() } } } }) });
  assert.equal(put.status, 200);
  await delay(500);
  assert.equal(read().length, 1, 'a saved completed dose produces no reminder');
  assert.equal((await fetch(api + '/api/health')).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state-u_supp.json'))).supplements.s2.name, 'Уже принято');
});
