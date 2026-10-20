import { normalizeOFF } from './nutrition.js';
const FIELDS = 'code,product_name,product_name_ru,generic_name,brands,nutriments,nutrition,nutrition_data_per,product_quantity_unit';
export function offURL(query) {
  const q = String(query || '').trim();
  if (q.length < 2 || q.length > 100) throw Object.assign(new Error('Введите от 2 до 100 символов.'), { status: 400 });
  if (/^\d+$/.test(q)) {
    if (!/^\d{8,14}$/.test(q)) throw Object.assign(new Error('Штрихкод должен содержать от 8 до 14 цифр.'), { status: 400 });
    return `https://world.openfoodfacts.org/api/v3.6/product/${q}.json?fields=${FIELDS}`;
  }
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.search = new URLSearchParams({ search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '20', lc: 'ru', fields: FIELDS }).toString();
  return url.href;
}
export function createOFFClient({ fetcher = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const requests = { search: [], product: [] };
  return async query => {
    const url = offURL(query);
    const cached = cache.get(url);
    if (cached && now() - cached.at < 3600000) return cached.items;
    const kind = url.includes('/product/') ? 'product' : 'search';
    requests[kind] = requests[kind].filter(t => now() - t < 60000);
    if (requests[kind].length >= (kind === 'search' ? 8 : 12)) throw Object.assign(new Error('Лимит поиска Open Food Facts. Подождите минуту; свои продукты доступны.'), { status: 429 });
    requests[kind].push(now());
    const response = await fetcher(url, { signal: AbortSignal.timeout(12000), redirect: 'error', headers: {
      'User-Agent': process.env.OFF_USER_AGENT || 'openGym/1.4.1 (https://github.com/DuarteSantos8/openGym)', Accept: 'application/json'
    } });
    if (!response.ok) throw new Error('Open Food Facts временно недоступен. Попробуйте позже или добавьте продукт вручную.');
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2000000) { await reader.cancel(); throw new Error('Слишком большой ответ базы продуктов.'); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const items = (data.product ? [data.product] : Array.isArray(data.products) ? data.products.slice(0, 20) : []).map(normalizeOFF).filter(Boolean);
    cache.set(url, { at: now(), items });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return items;
  };
}
