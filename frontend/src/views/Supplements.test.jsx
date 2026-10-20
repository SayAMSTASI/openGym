// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Supplements, { SupplementForm, SupplementCatalogue, ReferenceCard } from './Supplements.jsx'
import catalogue from '../lib/nutritabl-catalogue.json'
import { diaryOn } from '../../../api/nutrition.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ S: { supplements: {} }, toast: vi.fn(), openSheet: vi.fn() }))
vi.mock('../store/useStore.js', () => {
  const useStore = select => select({ S: mocks.S, user: null })
  useStore.getState = () => ({ S: mocks.S, update: fn => fn(mocks.S) })
  return { useStore }
})
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast: mocks.toast, openSheet: mocks.openSheet }) } }))
vi.mock('../lib/push.js', () => ({ enablePush: vi.fn(), syncPushSubscription: vi.fn(), pushSupported: () => false, sendTestPush: vi.fn() }))

let root
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; mocks.S = { supplements: {} }; vi.clearAllMocks() })
function render(component) {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(component)); return host
}
const source = over => ({ id: 's1', name: 'Мой препарат', dose: 'Своя порция', notes: 'Моё описание', times: ['09:00'], days: [0, 1, 2, 3, 4, 5, 6], tz: 'Europe/Moscow', active: true, reminder: true, ...over })
describe('supplement flow', () => {
  it('saves food link and counts an intake once, then removes its macros on undo', () => {
    const food = { id: 'p', name: 'Протеин', kcal: 400, protein: 80, fat: 4, carbs: 11 }
    mocks.S.nutritionFoods = { p: food }
    const close = vi.fn()
    const host = render(<SupplementForm source={source({ nutrition: { food, grams: 30 } })} close={close} />)
    act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(mocks.S.supplements.s1.nutrition.grams).toBe(30)
    act(() => root.render(<Supplements />))
    const click = text => act(() => [...host.querySelectorAll('button')].find(b => b.textContent === text).click())
    click('Принял')
    const day = Object.values(mocks.S.supplementLog)[0].date
    expect(diaryOn(mocks.S, day)[0].totals.protein).toBe(24)
    act(() => root.render(<Supplements key="refresh" />))
    click('Отменить отметку')
    expect(diaryOn(mocks.S, day)).toHaveLength(0)
  })
  it('ignores malformed imported history without crashing the tab', () => {
    mocks.S.supplementLog = { a: { date: '2026-10-20', status: 'taken' }, b: { date: '2026-10-20', time: '09:00', name: {}, status: 'taken' } }
    const host = render(<Supplements />)
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'История').click())
    expect(host.textContent).toContain('История появится после первой отметки')
  })
  it('saves dose, description and schedule together without prescribing a dose', () => {
    const close = vi.fn()
    const host = render(<SupplementForm source={source()} close={close} />)
    act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(close).toHaveBeenCalledOnce()
    expect(mocks.S.supplements.s1).toMatchObject({ dose: 'Своя порция', notes: 'Моё описание', times: ['09:00'], tz: 'Europe/Moscow', reminder: true })
  })
  it('keeps the form and description when duplicate times are rejected', () => {
    const close = vi.fn()
    const host = render(<SupplementForm source={source({ times: ['09:00', '09:00'] })} close={close} />)
    act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(close).not.toHaveBeenCalled()
    expect(host.querySelector('[role=alert]').textContent).toContain('не должно повторяться')
    expect(host.querySelector('textarea').value).toBe('Моё описание')
    expect(mocks.S.supplements).toEqual({})
  })
  it('renders the complete local catalogue without an iframe or required remote content', () => {
    const host = render(<SupplementCatalogue />)
    expect(host.querySelectorAll('.supp-catalogue-card')).toHaveLength(109)
    expect(host.querySelector('iframe')).toBeNull()
    act(() => host.querySelector('.supp-catalogue-card').click())
    expect(mocks.openSheet).toHaveBeenCalledOnce()
  })
  it('shows a local readable overview and an optional source link', () => {
    const item = catalogue.items.find(x => x.id === 'magnesium')
    const host = render(<ReferenceCard item={item} close={() => {}} />)
    expect(host.textContent).toContain(item.summary)
    expect(host.querySelector('a').href).toBe(item.url)
    expect(host.querySelector('a').referrerPolicy).toBe('no-referrer')
    expect(host.textContent).toContain('автоматически не переносится')
  })
})
