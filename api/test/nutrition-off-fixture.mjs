if (process.env.TEST_NUTRITION !== '1') throw new Error('Only for isolated nutrition tests');
globalThis.fetch = async url => {
  if (!String(url).startsWith('https://world.openfoodfacts.org/')) throw new Error('Unexpected upstream');
  return new Response(JSON.stringify({ products: [{ code: '3017620422003', product_name_ru: 'Тестовый продукт', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 80, fat_100g: 4, carbohydrates_100g: 11 } }] }));
};
