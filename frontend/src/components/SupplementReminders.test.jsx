// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SupplementReminders from './SupplementReminders.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const state = vi.hoisted(() => ({ S: {}, user: null, ready: true, toast: vi.fn() }))
vi.mock('../store/useStore.js', () => {
  const snapshot = () => ({ ...state, isGuest: () => true })
  const useStore = select => select(snapshot())
  useStore.getState = snapshot
  return { useStore }
})
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast: state.toast }) } }))
let root, shown
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T06:00:00Z'))
  state.user = null; state.toast.mockClear(); localStorage.clear(); shown = vi.fn(async () => {})
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted' } })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ showNotification: shown }) } })
  state.S = { supplements: { a: { id: 'a', name: 'Проверка', notes: 'Описание', times: ['06:00'], tz: 'UTC', reminder: true, active: true } }, supplementLog: {} }
})
afterEach(() => { act(() => root?.unmount()); vi.useRealTimers(); document.body.innerHTML = '' })
async function mount() {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<SupplementReminders />))
}
it('a guest gets one system alert, with no repeats on subsequent timer passes', async () => {
  await mount()
  expect(shown).toHaveBeenCalledOnce()
  expect(shown.mock.calls[0][1].body).toContain('Описание')
  await act(async () => vi.advanceTimersByTime(45000))
  expect(shown).toHaveBeenCalledOnce()
  expect(state.toast).toHaveBeenCalledOnce()
})
it('a signed-in page shows an in-app reminder and leaves the system alert to the server', async () => {
  state.user = { id: 'fixture' }
  await mount()
  expect(state.toast).toHaveBeenCalledOnce()
  expect(shown).not.toHaveBeenCalled()
})
it('denied browser permission does not lose the in-app reminder', async () => {
  window.Notification.permission = 'denied'
  await mount()
  expect(state.toast).toHaveBeenCalledOnce()
  expect(shown).not.toHaveBeenCalled()
})
it('a completed intake is silent in an open guest page', async () => {
  state.S.supplementLog['2026-10-20|a|06:00'] = { status: 'taken' }
  await mount()
  expect(state.toast).not.toHaveBeenCalled()
  expect(shown).not.toHaveBeenCalled()
})
