import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { supplementRemindersDue, supplementPush, pruneSupplementSent } from '../../../api/supplements.js'

export async function showSupplementNotification(payload) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker?.getRegistration()
  if (reg) await reg.showNotification(payload.title, { body: payload.body, tag: payload.tag, icon: 'icon-180.png', data: { route: '/supplements' } })
  else {
    const n = new Notification(payload.title, { body: payload.body, tag: payload.tag })
    n.onclick = () => { window.focus(); window.location.hash = '/supplements'; n.close() }
  }
  return true
}

// Every open app shows an in-app reminder. Signed-in users receive system alerts through the
// server; only guests show a local system alert, so a foreground tab never duplicates server push.
export default function SupplementReminders() {
  const ready = useStore(s => s.ready)
  const user = useStore(s => s.user)
  useEffect(() => {
    if (!ready) return
    const tick = () => {
      const store = useStore.getState()
      if (!store.user && !store.isGuest()) return
      const storageKey = 'gym_supplement_sent:' + (store.user?.id || 'guest')
      let sent = {}
      try { sent = pruneSupplementSent(JSON.parse(localStorage.getItem(storageKey) || '{}')) } catch {}
      const due = supplementRemindersDue(store.S, sent)
      if (!due.length) return
      for (const item of due) sent[item.key] = Date.now()
      try { localStorage.setItem(storageKey, JSON.stringify(sent)) } catch { return }
      for (const item of due) {
        const payload = supplementPush(item)
        useUI.getState().toast(payload.body)
        if (!store.user) showSupplementNotification(payload).catch(() => {})
      }
    }
    tick()
    const timer = setInterval(tick, 15000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [ready, user?.id])
  return null
}
