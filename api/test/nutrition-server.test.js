import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { diaryOn, sum } from '../nutrition.js';
const API = fileURLToPath(new URL('..', import.meta.url));
test('nutrition endpoint authenticates; state survives restart and is isolated between profiles', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-nutrition-'));
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'u_a', name: 'Fixture A' }, { id: 'u_b', name: 'Fixture B' }], creds: [], subs: [], invites: [] }));
  let child;
  const stop = async () => { if (child && child.exitCode === null) { child.kill('SIGKILL'); await new Promise(r => child.once('exit', r)); } };
  t.after(async () => { await stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  const start = async () => {
    let log = '';
    child = spawn(process.execPath, ['--import', './test/nutrition-off-fixture.mjs', 'server.js'], { cwd: API,
      env: { ...process.env, PORT: '0', DATA_DIR: dir, ORIGIN: 'http://localhost:8080', TEST_NUTRITION: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => { log += b }); child.stderr.on('data', b => { log += b });
    return `http://127.0.0.1:${await boundPort(child, () => log)}`;
  };
  let url = await start();
  const headers = id => { const p = `${id}:${Date.now() + 86400000}:0`; return { Cookie: 'gymsid=' + p + '.' + crypto.createHmac('sha256', secret).update(p).digest('base64url'), Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }; };
  assert.equal((await fetch(url + '/api/nutrition/search?q=test')).status, 401);
  const off = await fetch(url + '/api/nutrition/search?q=test', { headers: headers('u_a') });
  assert.equal(off.status, 200);
  const food = (await off.json()).items[0];
  assert.equal(food.protein, 80);
  assert.equal((await fetch(url + '/api/nutrition/search?q=x', { headers: headers('u_a') })).status, 400);
  const date = '2026-10-20';
  const state = { _ts: Date.now(), routines: [], workouts: [], nutritionFoods: { [food.id]: food }, nutritionRecipes: {}, nutritionGoals: { daily: { kcal: 2000 } },
    nutritionLog: { lunch: { date, meal: 'lunch', food, grams: 100 } },
    supplementLog: { '2026-10-20|s|09:00': { date, status: 'taken', nutrition: { food, grams: 30 } } } };
  const put = await fetch(url + '/api/data', { method: 'PUT', headers: headers('u_a'), body: JSON.stringify({ stamped: true, state }) });
  assert.equal(put.status, 200);
  await stop(); url = await start();
  const answer = await (await fetch(url + '/api/data', { headers: headers('u_a') })).json();
  const saved = answer.state;
  assert.ok(saved, JSON.stringify(answer).slice(0, 150));
  assert.equal(saved.nutritionFoods[food.id].name, 'Тестовый продукт');
  assert.equal(sum(diaryOn(saved, date).map(x => x.totals)).protein, 104);
  const other = await (await fetch(url + '/api/data', { headers: headers('u_b') })).json();
  assert.ok(!other.state?.nutritionFoods?.[food.id]);
  saved.supplementLog['2026-10-20|s|09:00'] = { ...saved.supplementLog['2026-10-20|s|09:00'], status: 'pending', _ts: Date.now() };
  saved._ts = Date.now();
  assert.equal((await fetch(url + '/api/data', { method: 'PUT', headers: headers('u_a'), body: JSON.stringify({ stamped: true, state: saved }) })).status, 200);
  const undone = await (await fetch(url + '/api/data', { headers: headers('u_a') })).json();
  assert.equal(sum(diaryOn(undone.state, date).map(x => x.totals)).protein, 80);
});
