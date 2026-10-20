// Pure nutrition calculations shared with the browser. Values are per 100 g unless stated.
export const NUTRIENTS = ['kcal', 'protein', 'fat', 'carbs'];
export const MEALS = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
export const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
export const number = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) ? Number(v) : NaN;
export const positive = v => number(v) > 0 && number(v) <= 100000;
export const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
export function macros(v) {
  if (!NUTRIENTS.every(k => number(v?.[k]) >= 0 && number(v[k]) <= (k === 'kcal' ? 1000 : 100))) return null;
  return Object.fromEntries(NUTRIENTS.map(k => [k, number(v[k])]));
}
export const scale = (v, grams) => Object.fromEntries(NUTRIENTS.map(k => [k, round(v[k] * grams / 100)]));
export const sum = items => Object.fromEntries(NUTRIENTS.map(k => [k, round(items.reduce((n, v) => n + (Number.isFinite(v?.[k]) ? v[k] : 0), 0))]));
export function foodOf(v) {
  const m = macros(v);
  return m && typeof v?.name === 'string' && v.name.trim() ? { ...v, ...m, name: v.name.trim().slice(0, 160) } : null;
}
export const foodsOf = S => Object.values(object(S?.nutritionFoods)).filter(v => !v?.deleted).map(foodOf).filter(Boolean);
export const recipesOf = S => Object.values(object(S?.nutritionRecipes)).filter(v => v && !v.deleted && foodOf(v) && positive(v.yieldGrams));
export function recipeNutrition(ingredients, yieldGrams) {
  if (!Array.isArray(ingredients) || !ingredients.length || ingredients.length > 100 || !positive(yieldGrams)) throw new Error('Укажите ингредиенты и массу готового блюда.');
  if (ingredients.some(x => !foodOf(x.food) || !positive(x.grams))) throw new Error('Проверьте продукт и массу каждого ингредиента.');
  const total = sum(ingredients.map(x => scale(x.food, Number(x.grams))));
  return Object.fromEntries(NUTRIENTS.map(k => [k, round(total[k] * 100 / Number(yieldGrams))]));
}
export function nutritionLink(value) {
  const food = foodOf(value?.food);
  return food && positive(value.grams) ? { food: { id: String(food.id || '').slice(0, 100), name: food.name, ...macros(food) }, grams: Number(value.grams) } : null;
}
export function diaryOn(S, date) {
  const manual = Object.entries(object(S?.nutritionLog)).filter(([, v]) => v && !v.deleted && v.date === date && foodOf(v.food) && positive(v.grams))
    .map(([id, v]) => ({ ...v, id, meal: MEALS[v.meal] ? v.meal : 'snack', totals: scale(v.food, Number(v.grams)) }));
  // A supplement intake is the source of truth: no second mutable food entry to duplicate or orphan.
  const supplements = Object.entries(object(S?.supplementLog)).filter(([, v]) => v?.date === date && v.status === 'taken' && nutritionLink(v.nutrition))
    .map(([id, v]) => ({ id: `supp:${id}`, date, meal: 'supplement', name: typeof v.name === 'string' ? v.name : '', time: typeof v.time === 'string' ? v.time : '', ...nutritionLink(v.nutrition), totals: scale(v.nutrition.food, Number(v.nutrition.grams)) }));
  return [...manual, ...supplements];
}
export function normalizeOFF(p) {
  if (!p || !/^\d{8,14}$/.test(String(p.code || ''))) return null;
  const n = object(p.nutriments);
  // API 3.5+ uses nutrition.aggregated_set; search can still return the legacy shape.
  const aggregate = object(p.nutrition?.aggregated_set);
  const modern = object(aggregate.nutrients);
  const modernValue = (key, unit) => {
    const v = modern[key];
    return ['100g', '100ml'].includes(aggregate.per) && v?.unit === unit ? number(v.value) : NaN;
  };
  const prefer = (a, b) => Number.isFinite(a) ? a : b;
  const kcal = prefer(modernValue('energy-kcal', 'kcal'), number(n['energy-kcal_100g']));
  const kj = prefer(modernValue('energy-kj', 'kJ'), prefer(number(n['energy-kj_100g']), (n.energy_unit === 'kJ' || n.energy_unit === 'kj') ? number(n.energy_100g) : NaN));
  const values = { kcal: Number.isFinite(kcal) ? kcal : Number.isFinite(kj) ? round(kj / 4.184) : NaN,
    protein: prefer(modernValue('proteins', 'g'), number(n.proteins_100g)), fat: prefer(modernValue('fat', 'g'), number(n.fat_100g)), carbs: prefer(modernValue('carbohydrates', 'g'), number(n.carbohydrates_100g)) };
  // Do not turn missing nutrients into zero or treat a volume basis as a mass basis.
  const volume = aggregate.per === '100ml' || /\bml\b|\bcl\b|\bl\b|мл|литр/i.test(String(p.nutrition_data_per || '') + ' ' + String(p.product_quantity_unit || ''));
  return { id: `off-${p.code}`, name: String(p.product_name_ru || p.product_name || p.generic_name || p.code).slice(0, 160),
    brand: String(p.brands || '').slice(0, 120), barcode: String(p.code), source: 'off', sourceUrl: `https://world.openfoodfacts.org/product/${p.code}`,
    ...Object.fromEntries(NUTRIENTS.map(k => [k, Number.isFinite(values[k]) ? values[k] : null])),
    needsReview: volume || !macros(values), volume, fetchedAt: Date.now() };
}
