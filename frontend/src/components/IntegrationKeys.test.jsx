// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import IntegrationKeys, { CreateIntegrationKey } from './IntegrationKeys.jsx'
const mocks = vi.hoisted(() => ({ api: vi.fn(), copy: vi.fn(), sheet: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: (...args) => mocks.api(...args) }))
vi.mock('../lib/clipboard.js', () => ({ copyText: (...args) => mocks.copy(...args) }))
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ openSheet: mocks.sheet }) } }))
vi.mock('./PasswordAuth.jsx', () => ({ ProveOwner: ({ onProof, submitText }) => <button onClick={() => onProof({ current: 'test-proof' })}>{submitText}</button> }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; vi.clearAllMocks() })
function render(view) { const host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(view)); return host }
it('uses owner proof and only reveals a new read key in the creation sheet', async () => {
  mocks.api.mockResolvedValue({ token: 'gym_ro_fixture' })
  const created = vi.fn(); const host = render(<CreateIntegrationKey auth={{ password: true }} onCreated={created} done={vi.fn()} />)
  expect(host.textContent).not.toContain('gym_ro_fixture')
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Создать ключ только для чтения').click())
  expect(mocks.api).toHaveBeenCalledWith('/api/integration-tokens/new', { method: 'POST', body: JSON.stringify({ current: 'test-proof', name: 'Codex', days: 90 }) })
  expect(host.querySelector('textarea').value).toBe('gym_ro_fixture'); expect(host.querySelector('textarea').readOnly).toBe(true)
  expect(created).toHaveBeenCalledOnce()
})
it('lists only metadata and revokes the selected own key without reusing an administrator API', async () => {
  mocks.api.mockImplementation(async path => path === '/api/account/passkeys' ? { password: true, passkeys: [] } : { tokens: [{ id: 'own-key', name: 'Codex', expires: Date.now() + 86400000 }] })
  let host; await act(async () => { host = render(<IntegrationKeys />) })
  expect(host.textContent).toContain('Codex'); expect(host.textContent).not.toContain('gym_ro_')
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Отозвать ключ').click())
  expect(mocks.api).toHaveBeenCalledWith('/api/integration-tokens/revoke', { method: 'POST', body: JSON.stringify({ id: 'own-key' }) })
  expect(mocks.api.mock.calls.every(([path]) => !path.includes('/admin/'))).toBe(true)
})
