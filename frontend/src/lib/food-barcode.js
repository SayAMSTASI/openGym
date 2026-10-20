// EAN/UPC/GTIN only: QR URLs and invalid check digits must never become food searches.
export function foodBarcode(raw) {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!/^(?:\d{8}|\d{12,14})$/.test(value)) return null
  let sum = 0
  for (let i = value.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(value[i]) * weight
  return (10 - sum % 10) % 10 === Number(value.at(-1)) ? value : null
}

let decoder
async function library() {
  if (!decoder) decoder = import('@zxing/library').catch(e => { decoder = null; throw e })
  return decoder
}
// Real pixel decoder, also exercised without a camera using independent EAN fixtures.
export async function decodeFoodPixels({ data, width, height } = {}) {
  if (!data || !width || !height || data.length !== width * height * 4) return null
  const { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, HybridBinarizer, BinaryBitmap } = await library()
  const reader = new MultiFormatReader()
  reader.setHints(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.ITF]], [DecodeHintType.TRY_HARDER, true]]))
  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0; i < gray.length; i++) gray[i] = (data[i * 4] + 2 * data[i * 4 + 1] + data[i * 4 + 2]) / 4
  const read = (pixels, w, h) => {
    try { return foodBarcode(reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, w, h)))).getText()) }
    catch { return null }
    finally { reader.reset() }
  }
  const found = read(gray, width, height)
  if (found) return found
  // A portrait photo can have the bars sideways. One rotation covers both remaining directions.
  const rotated = new Uint8ClampedArray(gray.length)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rotated[x * height + height - y - 1] = gray[y * width + x]
  return read(rotated, height, width)
}

export async function decodeFoodSource(source) {
  const width = source.videoWidth || source.naturalWidth || source.width || 0
  const height = source.videoHeight || source.naturalHeight || source.height || 0
  if (!width || !height) return null
  const ratio = Math.min(1, 1400 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Не удалось прочитать изображение в этом браузере.')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if (typeof globalThis.BarcodeDetector === 'function') {
    try {
      const detector = new globalThis.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'itf'] })
      const codes = await detector.detect(canvas)
      const found = codes.map(x => foodBarcode(x.rawValue)).find(Boolean)
      if (found) return found
    } catch { /* Use the bundled decoder in Safari and browsers with incomplete native support. */ }
  }
  return decodeFoodPixels(ctx.getImageData(0, 0, canvas.width, canvas.height))
}

export async function decodeFoodPhoto(file) {
  if (!file) return null
  if (file.size > 20 * 1024 * 1024) throw new Error('Выберите фото размером до 20 МБ.')
  let image, url
  try {
    if (typeof createImageBitmap === 'function') image = await createImageBitmap(file)
    else image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Не удалось открыть фото. Выберите JPG или PNG.'))
      url = URL.createObjectURL(file); img.src = url
    })
    return await decodeFoodSource(image)
  } finally { image?.close?.(); if (url) URL.revokeObjectURL(url) }
}
