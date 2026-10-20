import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import { ProveOwner } from './PasswordAuth.jsx'
export default function TransferAdmin({ target, done }) {
  const [auth, setAuth] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  useEffect(() => { api('/api/account/passkeys').then(setAuth).catch(() => setError('Не удалось загрузить способы подтверждения. Закройте окно и повторите.')) }, [])
  return <><h3>Передать права администратора</h3>
    <p>Пользователь <b>{target.name}</b> получит полный доступ к администрированию и данным пользователей. Ваш аккаунт станет обычным; его записи сохранятся.</p>
    <p className="small muted">Проверьте имя получателя и подтвердите действие своим паролем или passkey. Вернуть вам права сможет новый администратор.</p>
    {error && <p role="alert">{error}</p>}
    {auth && <ProveOwner password={auth.password} passkey={auth.passkeys?.length > 0} submitText={'Передать права ' + target.name} onProof={async proof => {
      const result = await api('/api/admin/transfer', { method: 'POST', body: JSON.stringify({ ...proof, id: target.id }) })
      useStore.getState().setUser(result.user)
      done(); navigate('/settings/account')
    }} />}
  </>
}
