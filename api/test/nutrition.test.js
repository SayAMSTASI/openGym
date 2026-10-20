import test from 'node:test';
import assert from 'node:assert/strict';
import { macros, scale, sum, recipeNutrition, normalizeOFF, diaryOn } from '../nutrition.js';
import { cleanSupplement, intakeRecord } from '../supplements.js';
import { createOFFClient, offURL } from '../open-food-facts.js';
import { mergeStates, stampChange, resetIdsOf } from '../../frontend/src/lib/sync-merge.js';
import { stampPut } from '../sync-stamps.js';
const food = { id: 'protein', name: 'Протеин', kcal: 400, protein: 80, fat: 4, carbs: 11 };
const date = '2026-10-20';
test('portion maths and recipe cooked yield have an independent numerical oracle', () => {
  assert.deepEqual(scale(food, 30), { kcal: 120, protein: 24, fat: 1.2, carbs: 3.3 });
  const oats = { id: 'oats', name: 'Овсянка', kcal: 360, protein: 12, fat: 6, carbs: 60 };
  const result = recipeNutrition([{ food: oats, grams: 100 }, { food, grams: 30 }], 400);
  assert.deepEqual(result, { kcal: 120, protein: 9, fat: 1.8, carbs: 15.83 });
  assert.equal(sum([scale(food, 30), scale(oats, 100)]).kcal, 480);
  assert.throws(() => recipeNutrition([{ food, grams: 0 }], 200));
  assert.throws(() => recipeNutrition([{ food, grams: 30 }], 0));
  assert.equal(macros({ ...food, fat: '' }), null);
  assert.equal(macros({ ...food, carbs: null }), null);
});
test('intake snapshot counts once, undo and skip remove macros, editing supplement leaves history stable', () => {
  const supplement = cleanSupplement({ id: 's', name: 'Протеин', nutrition: { food, grams: 30 } });
  const log = intakeRecord(supplement, date, '09:00', 'taken', 1);
  const S = { supplementLog: { a: log }, nutritionLog: {} };
  assert.equal(diaryOn(S, date).length, 1);
  assert.equal(sum(diaryOn(S, date).map(x => x.totals)).protein, 24);
  supplement.nutrition.grams = 60;
  assert.equal(diaryOn(S, date)[0].grams, 30);
  assert.equal(diaryOn(S, '2026-10-21').length, 0);
  for (const status of ['skipped', 'pending']) {
    log.status = status;
    assert.equal(diaryOn(S, date).length, 0);
  }
  log.status = 'taken';
  assert.equal(diaryOn(S, date).length, 1);
});
test('deleted and malformed imported entries do not count; saved recipe snapshots survive removal', () => {
  const S = { nutritionLog: { ok: { date, meal: 'lunch', food, grams: 50 }, gone: { date, food, grams: 100, deleted: true }, bad: { date, food, grams: -30 } }, supplementLog: { bad: null } };
  assert.equal(diaryOn(S, date).length, 1);
  assert.equal(diaryOn(S, date)[0].totals.kcal, 200);
});
test('OFF normalizer keeps unknown fields empty, converts kJ and flags volume basis', () => {
  const p = { code: '3017620422003', product_name_ru: 'Тест', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 80, fat_100g: 4, carbohydrates_100g: 11 } };
  assert.equal(normalizeOFF(p).needsReview, false);
  assert.equal(normalizeOFF({ ...p, product_quantity_unit: 'ml' }).needsReview, true);
  assert.equal(normalizeOFF({ ...p, nutriments: { proteins_100g: 3 } }).fat, null);
  assert.equal(normalizeOFF({ ...p, nutriments: { energy_100g: 418.4, energy_unit: 'kJ' } }).kcal, 100);
  assert.equal(normalizeOFF({ code: '<script>' }), null);
  const modern = { ...p, nutriments: {}, nutrition: { aggregated_set: { per: '100g', nutrients: {
    'energy-kcal': { value: 539, unit: 'kcal' }, proteins: { value: 6.3, unit: 'g' }, fat: { value: 30.9, unit: 'g' }, carbohydrates: { value: 57.5, unit: 'g' }
  } } } };
  assert.deepEqual(macros(normalizeOFF(modern)), { kcal: 539, protein: 6.3, fat: 30.9, carbs: 57.5 });
  modern.nutrition.aggregated_set.per = '100ml';
  assert.equal(normalizeOFF(modern).needsReview, true);
});
test('OFF proxy fixes destination, identifies app, caches and globally throttles external calls', async () => {
  let calls = 0;
  const lookup = createOFFClient({ now: () => 1, fetcher: async (url, opts) => {
    calls++;
    assert.equal(new URL(url).hostname, 'world.openfoodfacts.org');
    assert.match(opts.headers['User-Agent'], /openGym/);
    assert.equal(opts.redirect, 'error');
    return new Response(JSON.stringify({ products: [{ code: '3017620422003', product_name: 'Test', nutriments: {} }] }));
  } });
  await lookup('творог'); await lookup('творог'); assert.equal(calls, 1);
  for (let i = 0; i < 7; i++) await lookup('test' + i);
  await assert.rejects(lookup('one more'), e => e.status === 429);
  assert.equal(new URL(offURL('https://127.0.0.1/private')).hostname, 'world.openfoodfacts.org');
  assert.throws(() => offURL('1')); assert.throws(() => offURL('12345'));
});
test('OFF failures are not cached; oversized and redirected responses fail closed', async () => {
  const bad = createOFFClient({ fetcher: async () => new Response('x', { status: 503 }) });
  await assert.rejects(bad('test'));
  const huge = createOFFClient({ fetcher: async () => new Response('x'.repeat(2000001)) });
  await assert.rejects(huge('test'), /большой/);
});
test('food maps merge per item on offline devices; tombstones and goals persist on server and reset', () => {
  const base = { _ts: 100, routines: [], workouts: [], nutritionFoods: {}, nutritionRecipes: {}, nutritionLog: {}, nutritionGoals: {} };
  const a = structuredClone(base), b = structuredClone(base);
  a.nutritionFoods.a = { ...food, id: 'a' }; a.nutritionLog.a = { date, food, grams: 30 };
  a._ts = stampChange(base, a, 101);
  b.nutritionFoods.b = { ...food, id: 'b' }; b.nutritionGoals.daily = { kcal: 2000 };
  b._ts = stampChange(base, b, 102);
  let merged = mergeStates(a, b);
  assert.deepEqual(Object.keys(merged.nutritionFoods).sort(), ['a', 'b']);
  const deletion = structuredClone(merged);
  deletion.nutritionFoods.a = { deleted: true };
  deletion._ts = stampChange(merged, deletion, 110);
  merged = mergeStates(merged, deletion);
  assert.equal(merged.nutritionFoods.a.deleted, true);
  assert.deepEqual(resetIdsOf(merged).nutritionFoods.sort(), ['a', 'b']);
  const legacy = { _ts: 200, routines: [], workouts: [] };
  stampPut(merged, legacy, { overRead: true, now: 200 });
  assert.deepEqual(legacy.nutritionLog, merged.nutritionLog);
  assert.deepEqual(legacy.nutritionGoals, merged.nutritionGoals);
});
