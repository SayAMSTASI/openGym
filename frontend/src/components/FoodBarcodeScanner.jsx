import { useEffect, useRef, useState } from 'react'
import { Button } from './ui.jsx'
import { decodeFoodSource, decodeFoodPhoto } from '../lib/food-barcode.js'

export default function FoodBarcodeScanner({ onFound, onCancel }) {
  const video = useRef(null)
  const photo = useRef(null)
  const alive = useRef(true)
  const reported = useRef(false)
  const stopCamera = useRef(() => {})
  const callback = useRef(onFound)
  callback.current = onFound
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const finish = code => {
    if (!code || !alive.current || reported.current) return
    reported.current = true; stopCamera.current(); callback.current(code)
  }
  useEffect(() => {
    alive.current = true
    let stream, timer, stopped = false
    const stop = () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); if (video.current) video.current.srcObject = null }
    stopCamera.current = stop
    const fail = text => { if (!stopped && alive.current) { stop(); setError(text) } }
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) { fail('Камера недоступна. Используйте фото или введите цифры вручную. На сервере для камеры нужен HTTPS; localhost тоже поддерживается.'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        if (stopped) { stream.getTracks().forEach(track => track.stop()); return }
        const element = video.current
        if (!element) { stop(); return }
        element.srcObject = stream
        await element.play()
        if (stopped) return
        const started = Date.now()
        const tick = async () => {
          if (stopped) return
          if (Date.now() - started > 45000) { fail('Штрихкод пока не найден. Попробуйте ещё раз при хорошем освещении, выберите фото или введите цифры вручную.'); return }
          if (element.readyState >= 2) {
            try { const code = await decodeFoodSource(element); if (stopped) return; if (code) { finish(code); return } }
            catch { fail('Не удалось распознать изображение. Используйте фото или введите цифры вручную.'); return }
          }
          if (!stopped) timer = setTimeout(tick, 250)
        }
        tick()
      } catch (e) {
        fail(e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
          ? 'Доступ к камере запрещён. Разрешите его в настройках браузера или выберите фото штрихкода.'
          : 'Не удалось включить камеру. Возможно, она занята другим приложением. Можно выбрать фото штрихкода.')
      }
    })()
    return () => { alive.current = false; stop() }
  }, [attempt])
  const importPhoto = async e => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    stopCamera.current(); setBusy(true); setError('')
    try {
      const code = await decodeFoodPhoto(file)
      if (!alive.current) return
      if (code) finish(code)
      else setError('Штрихкод на фото не найден. Нужны все полосы целиком, без бликов, с белыми полями по краям.')
    } catch (err) { if (alive.current) setError(err.message || 'Не удалось прочитать фото.') }
    finally { if (alive.current) setBusy(false) }
  }
  return <div className="nutrition-form">
    <h3>Сканировать штрихкод продукта</h3>
    <p className="small muted">Наведите камеру на полосы штрихкода целиком. Поддерживаются EAN-13, EAN-8, UPC-A и GTIN-14. Цифры появятся в поиске автоматически.</p>
    {error ? <p role="alert">{error}</p> : <div className="cam-wrap food-barcode-camera"><video ref={video} playsInline muted autoPlay /><div className="food-barcode-frame" aria-hidden="true" /></div>}
    <p className="small dim">Видео и фото обрабатываются на устройстве. В базу продуктов передаётся только номер штрихкода.</p>
    <input ref={photo} type="file" accept="image/*" aria-label="Фото штрихкода" hidden onChange={importPhoto} />
    <Button disabled={busy} onClick={() => photo.current?.click()}>{busy ? 'Читаем фото…' : 'Выбрать фото штрихкода'}</Button>
    {error && <Button disabled={busy} onClick={() => { setError(''); setAttempt(n => n + 1) }}>Повторить сканирование</Button>}
    <Button variant="ghost" onClick={() => { stopCamera.current(); onCancel() }}>Отмена / ввести вручную</Button>
  </div>
}
