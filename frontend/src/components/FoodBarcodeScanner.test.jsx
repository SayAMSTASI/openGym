// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FoodBarcodeScanner from './FoodBarcodeScanner.jsx'
const mocks = vi.hoisted(() => ({ decode: vi.fn(), photo: vi.fn() }))
vi.mock('../lib/food-barcode.js', () => ({ decodeFoodSource: (...args) => mocks.decode(...args), decodeFoodPhoto: (...args) => mocks.photo(...args) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.clearAllMocks() })
function render(onFound = vi.fn(), onCancel = vi.fn()) {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(<FoodBarcodeScanner onFound={onFound} onCancel={onCancel} />)); return host
}
const media = request => Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: request } })
describe('food camera lifecycle', () => {
  it('shows a Russian recovery path when permission is denied', async () => {
    media(vi.fn().mockRejectedValue(Object.assign(new Error(), { name: 'NotAllowedError' })))
    let host; await act(async () => { host = render() })
    expect(host.textContent).toContain('Доступ к камере запрещён')
    expect(host.textContent).toContain('Выбрать фото штрихкода')
    expect(host.textContent).toContain('Отмена / ввести вручную')
  })
  it('stops late permission streams after the sheet was closed', async () => {
    let resolve; const stop = vi.fn()
    media(vi.fn(() => new Promise(r => { resolve = r })))
    render(); act(() => root.unmount()); root = null
    await act(async () => resolve({ getTracks: () => [{ stop }] }))
    expect(stop).toHaveBeenCalledOnce()
  })
  it('reports a decoded barcode once and stops all camera tracks', async () => {
    const stop = vi.fn(), found = vi.fn()
    media(vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }))
    vi.spyOn(HTMLMediaElement.prototype, 'srcObject', 'set').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2)
    mocks.decode.mockResolvedValue('3017620422003')
    await act(async () => { render(found) })
    expect(found).toHaveBeenCalledExactlyOnceWith('3017620422003')
    expect(stop).toHaveBeenCalledOnce()
  })
  it('stops the camera immediately on cancel', async () => {
    const stop = vi.fn(), cancel = vi.fn()
    media(vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }))
    vi.spyOn(HTMLMediaElement.prototype, 'srcObject', 'set').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    mocks.decode.mockResolvedValue(null)
    let host; await act(async () => { host = render(vi.fn(), cancel) })
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent.includes('Отмена')).click())
    expect(cancel).toHaveBeenCalledOnce(); expect(stop).toHaveBeenCalledOnce()
  })
})
