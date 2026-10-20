import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useUI } from '../store/useUI.js'
import { Button, TextField } from './ui.jsx'
import { ProveOwner } from './PasswordAuth.jsx'
import { copyText } from '../lib/clipboard.js'

export function CreateIntegrationKey({ auth, done, onCreated }) {
  const [name, setName] = useState('Codex')
  const [days, setDays] = useState(90)
  const [token, setToken] = useState(null)
  return <div className="nutrition-form"><h3>Доступ к моим данным для Codex / API</h3>
    {token ? <><p>Скопируйте ключ сейчас: повторно он не показывается.</p><textarea className="field" readOnly aria-label="Новый ключ только для чтения" value={token} rows={3} /><Button onClick={() => copyText(token)}>Скопировать ключ</Button><Button variant="ghost" onClick={done}>Готово</Button></>
      : <><p className="small muted">Только ваш профиль: тренировки, вес, питание и добавки. Ключ не даёт права менять данные или управлять пользователями. Подключённый ИИ сможет читать эти сведения для ответа вам.</p>
        <label>Название подключения<TextField value={name} maxLength={60} onChange={e => setName(e.target.value)} /></label>
        <label>Срок действия<select className="field" value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map(d => <option key={d} value={d}>{d} дней</option>)}</select></label>
        <ProveOwner passkey={auth.passkeys?.length > 0} password={auth.password} submitText="Создать ключ только для чтения" onProof={async proof => {
          const result = await api('/api/integration-tokens/new', { method: 'POST', body: JSON.stringify({ ...proof, name, days }) }); setToken(result.token); onCreated?.()
        }} />
      </>}
  </div>
}
export default function IntegrationKeys() {
  const [items, setItems] = useState([])
  const [auth, setAuth] = useState(null)
  const [error, setError] = useState('')
  const load = async () => {
    try { const [list, proofs] = await Promise.all([api('/api/integration-tokens'), api('/api/account/passkeys')]); setItems(list.tokens); setAuth(proofs); setError('') }
    catch { setError('Не удалось загрузить подключения. Проверьте соединение и повторите.'); setAuth(null) }
  }
  useEffect(() => { load() }, [])
  const create = () => useUI.getState().openSheet(close => <CreateIntegrationKey auth={auth} onCreated={load} done={() => { close(); load() }} />)
  return <section className="card" style={{ marginTop: 16 }}><h3>Codex / MCP / API</h3><p className="small muted">Ключи только для чтения вашего профиля. Для другого человека создаётся ключ в его собственном аккаунте.</p>
    {error && <p role="alert">{error}<Button size="sm" onClick={load}>Повторить</Button></p>}
    <Button disabled={!auth} onClick={create}>Создать подключение</Button>
    {items.map(item => <div key={item.id} style={{ marginTop: 12 }}><b>{item.name}</b><p className="small dim">Только чтение · до {new Date(item.expires).toLocaleDateString('ru-RU')}</p><Button size="sm" variant="ghost" onClick={async () => {
      try { await api('/api/integration-tokens/revoke', { method: 'POST', body: JSON.stringify({ id: item.id }) }); await load() }
      catch { setError('Не удалось отозвать ключ. Повторите после проверки соединения.') }
    }}>Отозвать ключ</Button></div>)}
  </section>
}
