// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Nutrition, { FoodForm, RecipeForm, EntryForm, ProductSearch } from './Nutrition.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ S: {}, user: { id: 'test' }, api: vi.fn(), photo: vi.fn(), toast: vi.fn(), openSheet: vi.fn() }))
vi.mock('../lib/food-barcode.js', () => ({ decodeFoodPhoto: (...args) => mocks.photo(...args) }))
vi.mock('../store/useStore.js', () => {
  const useStore = select => select({ S: mocks.S, user: mocks.user })
  useStore.getState = () => ({ S: mocks.S, update: fn => fn(mocks.S) })
  return { useStore }
})
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast: mocks.toast, openSheet: mocks.openSheet }) } }))
vi.mock('../lib/api.js', () => ({ api: (...args) => mocks.api(...args) }))
let root
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; mocks.S = {}; mocks.user = { id: 'test' }; vi.clearAllMocks() })
function render(component) { const host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(component)); return host }
const food = { id: 'p', name: 'Протеин', kcal: 400, protein: 80, fat: 4, carbs: 11 }
const submit = host => act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
describe('nutrition flows', () => {
  it('reads a picked photo locally and searches its code without opening a camera sheet', async () => {
    mocks.photo.mockResolvedValue('3017620422003'); mocks.api.mockResolvedValue({ items: [] })
    const host = render(<ProductSearch />)
    const input = host.querySelector('input[type=file]')
    const file = new File(['fixture'], 'barcode.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(mocks.photo).toHaveBeenCalledExactlyOnceWith(file)
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith('/api/nutrition/search?q=3017620422003')
    expect(mocks.openSheet).not.toHaveBeenCalled()
  })
  it('does not query Open Food Facts when no barcode is found in a photo', async () => {
    mocks.photo.mockResolvedValue(null)
    const host = render(<ProductSearch />)
    const input = host.querySelector('input[type=file]')
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['empty'], 'blank.png')] })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(mocks.api).not.toHaveBeenCalled(); expect(host.textContent).toContain('Штрихкод на фото не найден')
  })
  it('puts the scanned digits into search and sends exactly one lookup without stale query state', async () => {
    mocks.api.mockResolvedValue({ items: [{ id: 'off-3017620422003', name: 'Тестовый продукт', barcode: '3017620422003', kcal: 539, protein: 6.3, fat: 30.9, carbs: 57.5 }] })
    const host = render(<ProductSearch />)
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Сканировать штрихкод').click())
    const close = vi.fn()
    const scanner = mocks.openSheet.mock.calls[0][0](close)
    await act(async () => { scanner.props.onFound('3017620422003') })
    expect(close).toHaveBeenCalledOnce()
    expect(host.querySelector('input').value).toBe('3017620422003')
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith('/api/nutrition/search?q=3017620422003')
    expect(host.textContent).toContain('Тестовый продукт')
  })
  it('opens Russian tabs and renders totals from diary and supplement together', () => {
    const date = new Date(); const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    mocks.S = { nutritionLog: { x: { date: day, food, grams: 100, meal: 'lunch' } }, supplementLog: { s: { date: day, status: 'taken', nutrition: { food, grams: 30 }, name: 'Мой протеин', time: '09:00' } } }
    const host = render(<Nutrition />)
    expect(host.textContent).toContain('Питание'); expect(host.textContent).toContain('520'); expect(host.textContent).toContain('104')
    expect(host.textContent).toContain('Спортивные добавки')
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Продукты').click())
    expect(host.textContent).toContain('Open Food Facts')
  })
  it('saves a personal product and rejects unknown macros without silently replacing them by zero', () => {
    const close = vi.fn(); const host = render(<FoodForm source={{ ...food, fat: null }} close={close} />)
    submit(host); expect(close).not.toHaveBeenCalled(); expect(host.textContent).toContain('Неизвестное значение')
    act(() => root.render(<FoodForm key="valid" source={food} close={close} />)); submit(host)
    expect(mocks.S.nutritionFoods.p.protein).toBe(80); expect(close).toHaveBeenCalledOnce()
  })
  it('saves a portion with snapshot independent of later library edits', () => {
    mocks.S.nutritionFoods = { p: food }
    const close = vi.fn(); const host = render(<EntryForm date="2026-10-20" selected={food} close={close} />)
    submit(host); const entry = Object.values(mocks.S.nutritionLog)[0]
    expect(entry).toMatchObject({ date: '2026-10-20', grams: 100, meal: 'breakfast' })
    mocks.S.nutritionFoods.p = { ...food, kcal: 100 }
    expect(entry.food.kcal).toBe(400)
  })
  it('recipe form saves yield and ingredient composition with expected nutrition', () => {
    const close = vi.fn(); const host = render(<RecipeForm source={{ id: 'r', name: 'Коктейль', ingredients: [{ food, grams: 30 }], yieldGrams: 300 }} close={close} />)
    submit(host); expect(close).toHaveBeenCalledOnce()
    expect(mocks.S.nutritionRecipes.r).toMatchObject({ kcal: 40, protein: 8, yieldGrams: 300 })
  })
  it('search uses own server only on submit and shows recoverable upstream errors', async () => {
    mocks.api.mockRejectedValue(new Error('База временно недоступна'))
    const host = render(<ProductSearch />)
    expect(mocks.api).not.toHaveBeenCalled()
    const input = host.querySelector('input'); act(() => { input.value = 'творог'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(mocks.api.mock.calls[0][0]).toMatch(/^\/api\/nutrition\/search\?q=/)
    expect(host.querySelector('[role=alert]').textContent).toContain('недоступна')
  })
})
