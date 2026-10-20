import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO, fmtDate, uid } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Button, Segmented, Switch, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { enablePush, pushSupported, syncPushSubscription, sendTestPush } from '../lib/push.js'
import { showSupplementNotification } from '../components/SupplementReminders.jsx'
import catalogue from '../lib/nutritabl-catalogue.json'
import { cleanSupplement, supplementsOf, intakesOn, intakeRecord, TIME_RE, SUPPLEMENT_LIMIT, validDay } from '../../../api/supplements.js'
import { foodsOf, nutritionLink } from '../../../api/nutrition.js'
import './Supplements.css'

const update = fn => useStore.getState().update(fn)
const toast = text => useUI.getState().toast(text)
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const DAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const statusLabel = { taken: 'Принято', skipped: 'Пропущено', pending: 'Не отмечено' }
const byId = new Map(catalogue.items.map(x => [x.id, x]))

export function SupplementForm({ close, source, ingredient }) {
  const foods = foodsOf(useStore(s => s.S))
  const [nutrition, setNutrition] = useState(source?.nutrition || null)
  const [form, setForm] = useState(() => source || {
    id: uid(), name: ingredient?.name || '', dose: '', notes: '', ingredientId: ingredient?.id || '',
    times: ['09:00'], days: [0, 1, 2, 3, 4, 5, 6], tz: zone(), reminder: false, active: true, start: todayISO(), end: '',
  })
  const [error, setError] = useState('')
  const set = (key, value) => setForm(old => ({ ...old, [key]: value }))
  const save = e => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Введите название добавки.'); return }
    if (!form.times.length || form.times.some(x => !TIME_RE.test(x))) { setError('Укажите корректное время каждого приёма.'); return }
    if (new Set(form.times).size !== form.times.length) { setError('Время приёмов не должно повторяться.'); return }
    if (!form.days.length) { setError('Выберите хотя бы один день недели.'); return }
    if ((form.start && !validDay(form.start)) || (form.end && !validDay(form.end)) || (form.end && form.start && form.end < form.start)) {
      setError('Дата окончания должна быть не раньше начала.'); return
    }
    try { new Intl.DateTimeFormat('ru', { timeZone: form.tz }).format() } catch { setError('Укажите часовой пояс, например Europe/Moscow.'); return }
    if (nutrition && !nutritionLink(nutrition)) { setError('Для учёта БЖУ выберите продукт и укажите массу порции.'); return }
    try {
      update(S => {
        if (!S.supplements || typeof S.supplements !== 'object' || Array.isArray(S.supplements)) S.supplements = {}
        if (!source && Object.keys(S.supplements).length >= SUPPLEMENT_LIMIT) throw new Error('limit')
        S.supplements[form.id] = { ...cleanSupplement({ ...form, nutrition }), _ts: Date.now() }
      })
      close()
      toast('График добавки сохранён')
    } catch { setError('Не удалось сохранить. Проверьте свободное место или лимит 100 добавок. Введённые данные остались в форме.') }
  }
  return <form className="supp-form" onSubmit={save}>
    <h3>{source ? 'Изменить добавку' : 'Добавить в мой график'}</h3>
    <label>Название<TextField autoFocus required maxLength={120} value={form.name} onChange={e => set('name', e.target.value)} /></label>
    <label>Моя доза / порция<TextField maxLength={120} placeholder="Количество и единица — по вашей схеме" value={form.dose} onChange={e => set('dose', e.target.value)} /></label>
    <label>Описание / как я принимаю<textarea className="field" rows={3} maxLength={2000} placeholder="Что за препарат, форма, состав, связь с едой и ваши заметки" value={form.notes} onChange={e => set('notes', e.target.value)} /></label>
    <label>Карточка в локальном справочнике<select className="field" value={form.ingredientId || ''} onChange={e => set('ingredientId', e.target.value)}>
      <option value="">Без привязки / свой препарат</option>
      {catalogue.items.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select></label>
    <fieldset><legend>Связь с питанием / БЖУ</legend>
      <label>Продукт на один приём<select className="field" value={nutrition?.food?.id || ''} onChange={e => { const food = foods.find(f => f.id === e.target.value); setNutrition(food ? { food, grams: nutrition?.grams || '' } : null) }}>
        <option value="">Не учитывать в питании</option>
        {nutrition?.food && !foods.some(f => f.id === nutrition.food.id) && <option value={nutrition.food.id}>{nutrition.food.name} (сохранённая карточка)</option>}
        {foods.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select></label>
      {nutrition && <label>Масса порции на один приём, г<input className="field" required type="number" min="0.01" max="100000" step="any" value={nutrition.grams} onChange={e => setNutrition(v => ({ ...v, grams: e.target.value }))} /></label>}
      <p className="small dim">Сначала сохраните продукт во вкладке «Питание». При отметке «Принято» его БЖУ попадут в дневник на дату приёма. Отмена или пропуск уберут эту порцию. Не добавляйте её вручную повторно.</p>
    </fieldset>
    <fieldset><legend>Время приёма</legend>
      {form.times.map((time, i) => <div className="supp-time-row" key={i}>
        <input className="field" aria-label={`Время приёма ${i + 1}`} type="time" required value={time} onChange={e => set('times', form.times.map((v, n) => n === i ? e.target.value : v))} />
        <button type="button" className="iconbtn" disabled={form.times.length === 1} aria-label={`Убрать время ${i + 1}`} onClick={() => set('times', form.times.filter((_, n) => n !== i))}><Icon name="minus" /></button>
      </div>)}
      <Button type="button" size="sm" disabled={form.times.length >= 8} onClick={() => set('times', [...form.times, ''])}>Добавить время</Button>
    </fieldset>
    <fieldset><legend>Дни недели</legend><div className="supp-week">{[1, 2, 3, 4, 5, 6, 0].map(d =>
      <button type="button" key={d} aria-pressed={form.days.includes(d)} onClick={() => set('days', form.days.includes(d) ? form.days.filter(v => v !== d) : [...form.days, d])}>{DAY_LABELS[d]}</button>
    )}</div></fieldset>
    <div className="supp-two-col">
      <label>Начало<input className="field" type="date" value={form.start || ''} onChange={e => set('start', e.target.value)} /></label>
      <label>Окончание (необязательно)<input className="field" type="date" min={form.start || undefined} value={form.end || ''} onChange={e => set('end', e.target.value)} /></label>
    </div>
    <label>Часовой пояс<TextField required maxLength={80} value={form.tz} onChange={e => set('tz', e.target.value)} /></label>
    <div className="row between"><span>Напоминать в указанное время</span><Switch aria-label="Напоминать о добавке" checked={form.reminder} onChange={v => set('reminder', v)} /></div>
    <p className="small dim">Доза и описание задаются вами. Сведения справочника не являются персональным назначением.</p>
    {error && <p className="supp-error" role="alert">{error}</p>}
    <Button type="submit" variant="primary">Сохранить график</Button>
    <Button type="button" variant="ghost" onClick={close}>Отмена</Button>
  </form>
}

const openForm = (source, ingredient) => useUI.getState().openSheet(close => <SupplementForm close={close} source={source} ingredient={ingredient} />)

export function ReferenceCard({ item, close }) {
  return <div className="supp-reference">
    <div className="supp-symbol">{item.code}</div><h3>{item.name}</h3>
    <p className="sub">{item.english} · {item.type}</p>
    {item.formula && <p className="small">Формула: {item.formula}</p>}
    {item.group && <p className="small">Раздел: {item.group}</p>}
    {item.draft && <p className="supp-warning">Исходная карточка ещё не прошла редакционную проверку.</p>}
    <h4>Краткий обзор</h4><p className="supp-copy">{item.summary}</p>
    <p className="small dim">Это справочные сведения, а не оценка того, подходит ли добавка лично вам. Дозировка в график автоматически не переносится.</p>
    <p className="small dim">Краткий пересказ по Nutritabl. {item.updated ? `Дата материала: ${item.updated}. ` : ''}Проверка источника: {catalogue.checked}. Полная статья в локальную карточку не включена.</p>
    <a href={item.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Исходная статья Nutritabl ↗</a>
    <div style={{ height: 16 }} />
    <Button variant="primary" onClick={() => { close(); openForm(null, item) }}>Добавить в мой график</Button>
    <Button variant="ghost" onClick={close}>Закрыть</Button>
  </div>
}
const openReference = item => useUI.getState().openSheet(close => <ReferenceCard item={item} close={close} />)

export function SupplementCatalogue() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [group, setGroup] = useState('')
  const items = useMemo(() => catalogue.items.filter(x => (!type || x.type === type) && (!group || x.group === group) &&
    `${x.name} ${x.english} ${x.code}`.toLocaleLowerCase('ru').replaceAll('ё', 'е').includes(query.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е'))), [query, type, group])
  return <>
    <div className="card supp-intro"><b>Локальный справочник · {catalogue.items.length} карточек</b>
      <p className="small muted">Поиск и краткие обзоры работают без Nutritabl. Полные исходные статьи доступны по необязательной внешней ссылке.</p>
    </div>
    <label className="supp-search">Поиск по названию или коду<TextField type="search" placeholder="Например, магний или Mg" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="supp-two-col supp-filters">
      <label>Тип<select className="field" value={type} onChange={e => setType(e.target.value)}><option value="">Все типы</option>{[...new Set(catalogue.items.map(x => x.type))].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Раздел<select className="field" value={group} onChange={e => setGroup(e.target.value)}><option value="">Все разделы</option>{[...new Set(catalogue.items.map(x => x.group).filter(Boolean))].map(x => <option key={x}>{x}</option>)}</select></label>
    </div>
    <p className="small dim" role="status">Найдено: {items.length}</p>
    {!items.length && <div className="empty">Ничего не найдено. Измените поиск или фильтры.<Button onClick={() => { setQuery(''); setType(''); setGroup('') }}>Сбросить</Button></div>}
    <div className="supp-grid">{items.map(item => <button className="card supp-catalogue-card" key={item.id} onClick={() => openReference(item)}>
      <span className="supp-code">{item.code}</span><b>{item.name}</b><span className="small muted">{item.type}</span>
      {item.draft && <span className="small">В подготовке</span>}
    </button>)}</div>
    <p className="small dim">Названия, классификация и ссылки: Nutritabl, снимок {catalogue.checked}. Обзоры составлены отдельно для локального приложения; это не копия полных статей.</p>
  </>
}

function NotificationControls() {
  const user = useStore(s => s.user)
  const [state, setState] = useState('checking')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    if (!user) setState('Notification' in window ? Notification.permission : 'unsupported')
    else if (!pushSupported()) setState('unsupported')
    else syncPushSubscription().then(ok => { if (alive) setState(ok ? 'active' : Notification.permission) }).catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [user?.id])
  const enable = async () => {
    setBusy(true)
    try {
      if (user) { await enablePush(); setState('active') }
      else setState(await Notification.requestPermission())
    } catch { setState('error'); toast('Уведомления не включены. Проверьте разрешения браузера и подключение.') }
    finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true)
    try {
      if (user) { await sendTestPush(); toast('Проверка отправлена. Доставку подтвердит уведомление браузера.') }
      else if (!(await showSupplementNotification({ title: 'Проверка добавок', body: 'Так выглядит напоминание о приёме.', tag: 'supplement-test' }))) toast('Разрешите уведомления в браузере.')
    } catch { toast('Не удалось отправить проверку уведомления.') }
    finally { setBusy(false) }
  }
  const enabled = user ? state === 'active' : state === 'granted'
  return <details className="card supp-notification"><summary>Настройка уведомлений · {enabled ? 'включены' : state === 'checking' ? 'проверка…' : 'не включены'}</summary>
    <p className="small muted">{user
      ? 'Сервер отправляет напоминания в часовом поясе добавки, даже когда вкладка закрыта. Компьютер и Docker должны работать; браузер должен разрешать доставку.'
      : 'Гостевой режим: напоминания работают, пока приложение открыто. Для серверных напоминаний при закрытой вкладке создайте профиль.'}</p>
    <p className="small dim">{state === 'unsupported' ? 'Этот браузер или адрес не поддерживает системные уведомления. Доступны отметки и напоминания внутри открытого приложения.' : state === 'denied' ? 'Браузер запретил уведомления. Разрешение меняется в настройках сайта.' : state === 'error' ? 'Не удалось подтвердить подключение уведомлений. Попробуйте ещё раз после проверки разрешений и сети.' : 'После разрешения браузера включите напоминания в графике нужной добавки. При перезапуске учитываются опоздания до 15 минут.'}</p>
    <div className="supp-actions">
      {!enabled && state !== 'unsupported' && state !== 'denied' && <Button size="sm" onClick={enable} disabled={busy || state === 'checking'}>Разрешить уведомления</Button>}
      {enabled && <Button size="sm" onClick={test} disabled={busy}>Проверить уведомление</Button>}
    </div>
  </details>
}

export default function Supplements() {
  const S = useStore(s => s.S)
  const [tab, setTab] = useState('today')
  const [date, setDate] = useState(todayISO)
  const [today, setToday] = useState(todayISO)
  const [historyLimit, setHistoryLimit] = useState(200)
  const lastToday = useRef(today)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = todayISO()
      if (now !== lastToday.current) {
        setDate(d => d === lastToday.current ? now : d)
        lastToday.current = now
        setToday(now)
      }
    }, 15000)
    return () => clearInterval(timer)
  }, [])
  const all = supplementsOf(S)
  const intakes = intakesOn(S, date)
  const logs = Object.entries(S.supplementLog && typeof S.supplementLog === 'object' ? S.supplementLog : {})
    .filter(([, v]) => v && validDay(v.date) && typeof v.time === 'string' && TIME_RE.test(v.time) &&
      typeof v.name === 'string' && (v.notes == null || typeof v.notes === 'string') &&
      (v.dose == null || typeof v.dose === 'string') && ['taken', 'skipped'].includes(v.status))
    .sort(([, a], [, b]) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
  const mark = (item, status) => {
    try {
      update(state => {
        if (!state.supplementLog || typeof state.supplementLog !== 'object') state.supplementLog = {}
        const link = item.supplement.nutrition
        const currentFood = link && foodsOf(state).find(f => f.id === link.food.id)
        const supplement = currentFood ? { ...item.supplement, nutrition: { ...link, food: currentFood } } : item.supplement
        state.supplementLog[item.key] = intakeRecord(supplement, item.date, item.time, status)
      })
    } catch { toast('Отметка не сохранена. Повторите после проверки свободного места.') }
  }
  const archive = s => {
    try { update(state => { state.supplements[s.id] = { ...s, active: !s.active, _ts: Date.now() } }) }
    catch { toast('Изменение не сохранено. Проверьте свободное место и повторите.') }
  }
  return <div className="narrow supplements-page">
    <div className="hdr"><div><h1>Добавки</h1><div className="sub">Мой приём, напоминания и справочник</div></div></div>
    <Segmented value={tab} onChange={setTab} options={[{ value: 'today', label: 'По дням' }, { value: 'mine', label: 'Мои' }, { value: 'history', label: 'История' }, { value: 'catalogue', label: 'Справочник' }]} />
    {tab !== 'catalogue' && <NotificationControls />}
    {tab === 'catalogue' && <SupplementCatalogue />}
    {tab === 'today' && <>
      <div className="supp-day"><label>День приёма<input className="field" type="date" max={today} value={date} onChange={e => { if (validDay(e.target.value) && e.target.value <= today) setDate(e.target.value) }} /></label>
        <Button size="sm" onClick={() => setDate(today)}>Сегодня</Button>
      </div>
      <div className="row between"><p className="small muted" role="status">Принято {intakes.filter(x => x.status === 'taken').length} из {intakes.length}</p><Button size="sm" icon="plus" onClick={() => openForm()}>Добавить</Button></div>
      {!intakes.length && <div className="empty">{all.some(x => x.active) ? 'На этот день приём не запланирован.' : 'Добавьте свою первую добавку или выберите её в справочнике.'}</div>}
      {intakes.map(item => <article className={'card supp-intake ' + item.status} key={item.key}>
        <div className="row between"><time>{item.time}</time><span className="small">{statusLabel[item.status]}</span></div>
        <h3>{item.supplement.name}</h3>
        <p>{item.supplement.dose || 'Порция не указана'}</p>
        {item.supplement.notes && <p className="small muted supp-copy">{item.supplement.notes}</p>}
        <p className="small dim">{item.supplement.tz}</p>
        <div className="supp-actions">
          <Button size="sm" variant={item.status === 'taken' ? 'ghost' : 'primary'} aria-pressed={item.status === 'taken'} onClick={() => mark(item, item.status === 'taken' ? 'pending' : 'taken')}>{item.status === 'taken' ? 'Отменить отметку' : 'Принял'}</Button>
          <Button size="sm" aria-pressed={item.status === 'skipped'} onClick={() => mark(item, item.status === 'skipped' ? 'pending' : 'skipped')}>{item.status === 'skipped' ? 'Вернуть в план' : 'Пропустил'}</Button>
          {byId.has(item.supplement.ingredientId) && <Button size="sm" variant="ghost" onClick={() => openReference(byId.get(item.supplement.ingredientId))}>О добавке</Button>}
        </div>
      </article>)}
    </>}
    {tab === 'mine' && <>
      <Button variant="primary" icon="plus" onClick={() => openForm()}>Добавить свою добавку</Button>
      {!all.length && <div className="empty">Ваш график пока пуст. Дозы и описание вы задаёте сами.</div>}
      {all.map(s => <article className="card supp-intake" key={s.id}>
        <div className="row between"><h3>{s.name}</h3><span className="small dim">{s.active ? 'Активна' : 'Пауза'}</span></div>
        <p>{s.dose || 'Порция не указана'}</p><p className="small muted">{s.times.join(', ')} · {s.days.length === 7 ? 'ежедневно' : s.days.map(d => DAY_LABELS[d]).join(', ')}</p>
        {s.notes && <p className="small supp-copy">{s.notes}</p>}
        <p className="small dim">{s.reminder ? 'Напоминание включено' : 'Без напоминания'} · {s.tz}</p>
        <div className="supp-actions"><Button size="sm" onClick={() => openForm(s)}>Изменить</Button><Button size="sm" variant="ghost" onClick={() => archive(s)}>{s.active ? 'Приостановить' : 'Возобновить'}</Button></div>
      </article>)}
      <p className="small dim">Пауза отключает будущие приёмы и напоминания. История уже сделанных отметок сохраняется.</p>
    </>}
    {tab === 'history' && <>
      {!logs.length && <div className="empty">История появится после первой отметки приёма или пропуска.</div>}
      {logs.slice(0, historyLimit).map(([key, log]) => <article className="card supp-intake" key={key}>
        <div className="row between"><b>{fmtDate(log.date, true)} · {log.time}</b><span className="small">{statusLabel[log.status]}</span></div>
        <h3>{log.name}</h3><p className="small muted">{log.dose || 'Порция не указана'}</p>
        {log.notes && <p className="small supp-copy">{log.notes}</p>}
        <Button size="sm" variant="ghost" onClick={() => { try { update(state => { state.supplementLog[key] = { ...log, status: 'pending', _ts: Date.now() } }) } catch { toast('Не удалось отменить отметку.') } }}>Отменить отметку</Button>
      </article>)}
      {logs.length > historyLimit && <Button onClick={() => setHistoryLimit(v => v + 200)}>Показать ещё отметки</Button>}
    </>}
  </div>
}
