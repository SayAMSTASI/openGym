import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Button, Segmented, TextField } from '../components/ui.jsx'
import { todayISO, uid } from '../lib/format.js'
import { api } from '../lib/api.js'
import { NUTRIENTS, MEALS, foodsOf, recipesOf, foodOf, macros, positive, recipeNutrition, diaryOn, sum, round, object } from '../../../api/nutrition.js'
import FoodBarcodeScanner from '../components/FoodBarcodeScanner.jsx'
import { decodeFoodPhoto } from '../lib/food-barcode.js'
import './Nutrition.css'

const labels = { kcal: 'Ккал', protein: 'Белки', fat: 'Жиры', carbs: 'Углеводы' }
const update = fn => useStore.getState().update(fn)
const toast = text => useUI.getState().toast(text)
const open = content => useUI.getState().openSheet(content)
const save = (map, id, value) => update(S => {
  S[map] = { ...object(S[map]), [id]: { ...value, id, _ts: Date.now() } }
})
const describe = f => `${round(f.kcal)} ккал · Б ${round(f.protein)} · Ж ${round(f.fat)} · У ${round(f.carbs)}`
const message = 'Не удалось сохранить. Введённые данные остались в форме; проверьте свободное место.'
function NutrientFields({ value, set }) {
  return <div className="nutrition-numbers">{NUTRIENTS.map(k => <label key={k}>{labels[k]}{k !== 'kcal' && ', г'}<input className="field" aria-label={labels[k]} type="number" min="0" max={k === 'kcal' ? 1000 : 100} step="any" required value={value[k] ?? ''} onChange={e => set(k, e.target.value)} /></label>)}</div>
}
export function FoodForm({ source, close }) {
  const [value, setValue] = useState(() => ({ id: uid(), name: '', kcal: '', protein: '', fat: '', carbs: '', ...source }))
  const [error, setError] = useState('')
  const set = (k, v) => setValue(x => ({ ...x, [k]: v }))
  const submit = e => {
    e.preventDefault()
    if (!foodOf(value)) { setError('Укажите название и все четыре значения на 100 г. Неизвестное значение нельзя считать нулём.'); return }
    try { save('nutritionFoods', value.id, { ...foodOf(value), needsReview: false, volume: false, deleted: false }); close(); toast('Продукт сохранён') } catch { setError(message) }
  }
  return <form className="nutrition-form" onSubmit={submit}><h3>{source ? 'Проверить / изменить продукт' : 'Свой продукт'}</h3>
    <label>Название<TextField required maxLength={160} value={value.name} onChange={e => set('name', e.target.value)} /></label>
    <p className="small muted">Пищевая ценность на 100 г. Сверьте значения с упаковкой.</p>
    {source?.volume && <p className="nutrition-warning">В источнике может быть указано на 100 мл. Пересчитайте на 100 г по плотности продукта перед сохранением.</p>}
    <NutrientFields value={value} set={set} />
    {source?.source === 'off' && <p className="small dim">Источник: <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open Food Facts ↗</a>. Сохраняется локальная карточка; ваши исправления в Open Food Facts не отправляются.</p>}
    {error && <p role="alert">{error}</p>}<Button variant="primary" type="submit">Сохранить продукт</Button><Button type="button" variant="ghost" onClick={close}>Отмена</Button>
  </form>
}
export function RecipeForm({ source, close }) {
  const S = useStore(s => s.S)
  const foods = foodsOf(S)
  const [name, setName] = useState(source?.name || '')
  const [ingredients, setIngredients] = useState(source?.ingredients || [])
  const [yieldGrams, setYield] = useState(source?.yieldGrams || '')
  const [foodId, setFoodId] = useState(foods[0]?.id || '')
  const [grams, setGrams] = useState('100')
  const [error, setError] = useState('')
  const add = () => {
    const food = foods.find(x => x.id === foodId)
    if (!food || !positive(grams)) { setError('Выберите продукт и укажите массу ингредиента.'); return }
    if (ingredients.length >= 100) { setError('Максимум 100 ингредиентов.'); return }
    setIngredients(x => [...x, { food: { ...food }, grams: Number(grams) }]); setError('')
  }
  let preview = null
  try { preview = recipeNutrition(ingredients, yieldGrams) } catch { /* incomplete draft */ }
  const submit = e => {
    e.preventDefault()
    try {
      if (!name.trim()) throw new Error('Укажите название блюда.')
      const m = recipeNutrition(ingredients, yieldGrams)
      if (!macros(m)) throw new Error('Проверьте массу готового блюда: значения на 100 г слишком велики.')
      save('nutritionRecipes', source?.id || uid(), { name: name.trim(), ingredients, yieldGrams: Number(yieldGrams), ...m, deleted: false })
      close(); toast('Блюдо сохранено')
    } catch (err) { setError(err.message || message) }
  }
  return <form className="nutrition-form" onSubmit={submit}><h3>{source ? 'Изменить блюдо' : 'Своё блюдо'}</h3>
    <label>Название блюда<TextField required maxLength={160} value={name} onChange={e => setName(e.target.value)} /></label>
    <p className="small muted">Сначала сохраните продукты. Массу ингредиентов указывайте в том состоянии, для которого известны БЖУ: сухое, сырое или готовое.</p>
    <label>Продукт<select className="field" value={foodId} onChange={e => setFoodId(e.target.value)}><option value="">Выберите продукт</option>{foods.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    <label>Масса ингредиента, г<input className="field" type="number" min="0.01" max="100000" step="any" value={grams} onChange={e => setGrams(e.target.value)} /></label>
    <Button type="button" onClick={add} disabled={!foods.length}>Добавить ингредиент</Button>
    {ingredients.map((x, i) => <div className="row between nutrition-ingredient" key={i}><span>{x.food.name} · {x.grams} г</span><Button type="button" size="sm" variant="ghost" onClick={() => setIngredients(v => v.filter((_, j) => i !== j))}>Убрать</Button></div>)}
    <label>Масса всего готового блюда, г<input className="field" required type="number" min="0.01" max="100000" step="any" value={yieldGrams} onChange={e => setYield(e.target.value)} /></label>
    <p className="small muted">Взвесьте готовое блюдо: вода при приготовлении меняет массу, но не сумму БЖУ ингредиентов.</p>
    {preview && <p role="status">На 100 г: {describe(preview)}</p>}
    {error && <p role="alert">{error}</p>}<Button variant="primary" type="submit">Сохранить блюдо</Button><Button type="button" variant="ghost" onClick={close}>Отмена</Button>
  </form>
}
export function EntryForm({ date, source, selected, close }) {
  const S = useStore(s => s.S)
  const choices = [...foodsOf(S), ...recipesOf(S)]
  const [food, setFood] = useState(source?.food || selected || choices[0] || null)
  const [grams, setGrams] = useState(source?.grams || '100')
  const [meal, setMeal] = useState(source?.meal || 'breakfast')
  const [day, setDay] = useState(source?.date || date)
  const [error, setError] = useState('')
  const submit = e => {
    e.preventDefault()
    if (!foodOf(food) || !positive(grams) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) { setError('Выберите продукт, дату и массу порции.'); return }
    try { save('nutritionLog', source?.id || uid(), { food: { ...food }, grams: Number(grams), meal, date: day, deleted: false }); close(); toast('Запись питания сохранена') } catch { setError(message) }
  }
  return <form className="nutrition-form" onSubmit={submit}><h3>{source ? 'Изменить запись' : 'Добавить еду'}</h3>
    <label>Дата<input className="field" required type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
    <label>Приём пищи<select className="field" value={meal} onChange={e => setMeal(e.target.value)}>{Object.entries(MEALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label>Продукт или блюдо<select className="field" value={food?.id || ''} onChange={e => setFood(choices.find(x => x.id === e.target.value) || null)}>
      {!choices.some(x => x.id === food?.id) && food && <option value={food.id}>{food.name} (сохранено в записи)</option>}
      <option value="">Выберите продукт</option>{choices.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select></label>
    <label>Масса порции, г<input className="field" required type="number" min="0.01" max="100000" step="any" value={grams} onChange={e => setGrams(e.target.value)} /></label>
    {food && <p className="small muted">На 100 г: {describe(food)}</p>}
    {!choices.length && <p>Добавьте свой продукт или сохраните его из Open Food Facts на вкладке «Продукты».</p>}
    {error && <p role="alert">{error}</p>}<Button type="submit" variant="primary">Сохранить запись</Button><Button type="button" variant="ghost" onClick={close}>Отмена</Button>
  </form>
}
function GoalForm({ close }) {
  const S = useStore(s => s.S)
  const [value, setValue] = useState(object(S.nutritionGoals).daily || { kcal: '', protein: '', fat: '', carbs: '' })
  const [error, setError] = useState('')
  return <form className="nutrition-form" onSubmit={e => {
    e.preventDefault()
    if (!NUTRIENTS.every(k => positive(value[k]))) { setError('Укажите положительные значения всех целей.'); return }
    try { save('nutritionGoals', 'daily', Object.fromEntries(NUTRIENTS.map(k => [k, Number(value[k])]))); close() } catch { setError(message) }
  }}><h3>Мои цели на день</h3><p className="small muted">Задайте свои цели. Калории и БЖУ сохраняются независимо.</p>
    <div className="nutrition-numbers">{NUTRIENTS.map(k => <label key={k}>{labels[k]}<input className="field" required min="0.01" max="100000" step="any" type="number" value={value[k]} onChange={e => setValue(v => ({ ...v, [k]: e.target.value }))} /></label>)}</div>
    {error && <p role="alert">{error}</p>}<Button type="submit" variant="primary">Сохранить цели</Button><Button type="button" variant="ghost" onClick={close}>Отмена</Button>
  </form>
}
export function ProductSearch() {
  const user = useStore(s => s.user)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const serial = useRef(0)
  const photoInput = useRef(null)
  const runSearch = async text => {
    const request = ++serial.current
    setBusy(true); setError(''); setItems(null)
    try { const result = await api('/api/nutrition/search?q=' + encodeURIComponent(text.trim())); if (request === serial.current) setItems(result.items) }
    catch (err) { if (request === serial.current) setError(err.message || 'База продуктов недоступна. Добавьте продукт вручную.') }
    finally { if (request === serial.current) setBusy(false) }
  }
  const search = e => { e.preventDefault(); void runSearch(query) }
  const scan = () => open(close => <FoodBarcodeScanner onCancel={close} onFound={code => { close(); setQuery(code); void runSearch(code) }} />)
  const scanPhoto = async e => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setBusy(true); setError('')
    try {
      const code = await decodeFoodPhoto(file)
      if (!code) { setError('Штрихкод на фото не найден. Выберите чёткое фото всех полос с белыми полями по краям или введите цифры вручную.'); return }
      setQuery(code); await runSearch(code)
    } catch (err) { setError(err.message || 'Не удалось прочитать фото штрихкода.') }
    finally { setBusy(false) }
  }
  return <div className="card nutrition-search"><h3>Open Food Facts</h3>
    <form onSubmit={search}><label>Название продукта или штрихкод<TextField minLength={2} maxLength={100} required type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Например, творог или 13 цифр с упаковки" /></label><Button type="submit" disabled={busy || !user}>{busy ? 'Ищем…' : 'Найти продукт'}</Button></form>
    <div className="nutrition-actions"><Button disabled={busy || !user} onClick={scan}>Сканировать штрихкод</Button><Button disabled={busy || !user} onClick={() => photoInput.current?.click()}>Фото штрихкода</Button></div>
    <input ref={photoInput} type="file" accept="image/*" aria-label="Поиск продукта по фото штрихкода" hidden onChange={scanPhoto} />
    {!user && <p className="small muted">Поиск через сервер доступен после входа в профиль. Свои продукты можно создавать и в гостевом режиме.</p>}
    <p className="small dim">Поиск требует интернета. На сервер Open Food Facts отправляется только поисковый запрос; дневник и профиль туда не передаются. <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> · данные ODbL.</p>
    {error && <p role="alert">{error}</p>}{items?.length === 0 && <p role="status">Продукт не найден. Попробуйте штрихкод или создайте свою карточку.</p>}
    {items?.map(f => <div className="nutrition-result" key={f.id}><b>{f.name}</b><p className="small muted">{f.brand} · {f.barcode}</p><p className="small">{f.needsReview ? 'Неполные данные или другая единица: проверьте упаковку.' : `На 100 г: ${describe(f)}`}</p><Button size="sm" onClick={() => open(close => <FoodForm source={f} close={close} />)}>Проверить и сохранить</Button></div>)}
  </div>
}
export default function Nutrition() {
  const S = useStore(s => s.S)
  const [tab, setTab] = useState('diary')
  const [date, setDate] = useState(todayISO)
  const [filter, setFilter] = useState('')
  const diary = diaryOn(S, date)
  const totals = sum(diary.map(x => x.totals))
  const goals = object(S.nutritionGoals).daily || {}
  const remove = (map, item) => {
    if (!window.confirm(`Удалить «${item.food?.name || item.name}»? Сохранённая история и состав других блюд останутся.`)) return
    try { save(map, item.id, { deleted: true }) } catch { toast(message) }
  }
  const visible = list => list.filter(f => f.name.toLocaleLowerCase('ru').replaceAll('ё', 'е').includes(filter.toLocaleLowerCase('ru').replaceAll('ё', 'е')))
  return <div className="narrow nutrition-page"><div className="row between"><h1>Питание</h1><Button size="sm" variant="ghost" onClick={() => open(close => <GoalForm close={close} />)}>Мои цели</Button></div>
    <Segmented value={tab} onChange={setTab} options={[{ value: 'diary', label: 'Дневник' }, { value: 'foods', label: 'Продукты' }, { value: 'recipes', label: 'Мои блюда' }]} />
    {tab === 'diary' && <>
      <label className="nutrition-date">Дата дневника<input className="field" type="date" required value={date} onChange={e => { if (e.target.value) setDate(e.target.value) }} /></label>
      <div className="nutrition-summary">{NUTRIENTS.map(k => <div className="card" key={k}><span className="small muted">{labels[k]}{k !== 'kcal' && ', г'}</span><strong>{totals[k]}</strong>{positive(goals[k]) ? <><span className="small">из {goals[k]}</span><progress aria-label={labels[k]} max={Number(goals[k])} value={Math.min(totals[k], Number(goals[k]))} /><span className="small muted">{totals[k] <= goals[k] ? `Осталось ${round(goals[k] - totals[k])}` : `Сверх цели ${round(totals[k] - goals[k])}`}</span></> : <span className="small dim">Цель не задана</span>}</div>)}</div>
      <Button variant="primary" onClick={() => open(close => <EntryForm date={date} close={close} />)}>Добавить еду</Button>
      {!diary.length && <div className="empty">За этот день записей нет. Добавьте продукт или своё блюдо.</div>}
      {[...Object.entries(MEALS), ['supplement', 'Спортивные добавки']].map(([key, title]) => {
        const entries = diary.filter(x => x.meal === key)
        return entries.length > 0 && <section key={key}><h3>{title}</h3><p className="small muted">{describe(sum(entries.map(x => x.totals)))}</p>{entries.map(x => <div className="card nutrition-entry" key={x.id}>
          <b>{x.food.name}</b><p>{x.grams} г · {describe(x.totals)}</p>{key === 'supplement' ? <p className="small muted">{x.time} · {x.name}. Управляется отметкой во вкладке «Добавки».</p> : <div className="nutrition-actions"><Button size="sm" variant="ghost" onClick={() => open(close => <EntryForm date={date} source={x} close={close} />)}>Изменить</Button><Button size="sm" variant="ghost" onClick={() => remove('nutritionLog', x)}>Удалить</Button></div>}
        </div>)}</section>
      })}
      <p className="small dim">История хранит состав и БЖУ на момент записи. Изменение продукта или рецепта не пересчитывает прошлые дни.</p>
    </>}
    {tab === 'foods' && <><Button variant="primary" onClick={() => open(close => <FoodForm close={close} />)}>Создать свой продукт</Button><ProductSearch />
      <h3>Мои продукты · {foodsOf(S).length}</h3><TextField aria-label="Поиск в моих продуктах" placeholder="Поиск в сохранённых продуктах" value={filter} onChange={e => setFilter(e.target.value)} />
      {!foodsOf(S).length && <p className="empty">Сохраните продукт из базы или введите данные с упаковки.</p>}
      {visible(foodsOf(S)).map(f => <div className="card nutrition-entry" key={f.id}><b>{f.name}</b><p className="small muted">На 100 г: {describe(f)}</p><div className="nutrition-actions"><Button size="sm" onClick={() => open(close => <EntryForm date={date} selected={f} close={close} />)}>В дневник</Button><Button size="sm" variant="ghost" onClick={() => open(close => <FoodForm source={f} close={close} />)}>Изменить</Button><Button size="sm" variant="ghost" onClick={() => remove('nutritionFoods', f)}>Удалить</Button></div></div>)}
    </>}
    {tab === 'recipes' && <><Button variant="primary" onClick={() => open(close => <RecipeForm close={close} />)}>Создать блюдо</Button><p className="small muted">Составьте рецепт из своих продуктов. Укажите массу готового блюда — приложение рассчитает БЖУ на 100 г.</p>
      {!recipesOf(S).length && <p className="empty">Блюд пока нет. Сначала добавьте продукты.</p>}
      {recipesOf(S).map(f => <div className="card nutrition-entry" key={f.id}><b>{f.name}</b><p className="small muted">Выход {f.yieldGrams} г · на 100 г: {describe(f)}</p><div className="nutrition-actions"><Button size="sm" onClick={() => open(close => <EntryForm date={date} selected={f} close={close} />)}>В дневник</Button><Button size="sm" variant="ghost" onClick={() => open(close => <RecipeForm source={f} close={close} />)}>Состав / изменить</Button><Button size="sm" variant="ghost" onClick={() => remove('nutritionRecipes', f)}>Удалить</Button></div></div>)}
    </>}
  </div>
}
