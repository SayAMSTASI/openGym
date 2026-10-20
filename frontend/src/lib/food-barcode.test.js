import { describe, expect, it } from 'vitest'
import { foodBarcode, decodeFoodPixels, decodeFoodPhoto } from './food-barcode.js'

// Independent EAN encoding table used only to draw camera-like fixture pixels.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const parity = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
const invert = s => [...s].map(x => x === '1' ? '0' : '1').join('')
function picture(code, sideways = false) {
  const ean = code.length === 12 ? '0' + code : code
  const digits = ean.length === 8 ? ean.slice(0, 4) : ean.slice(1, 7)
  const pattern = ean.length === 8 ? 'LLLL' : parity[Number(ean[0])]
  const left = [...digits].map((d, i) => pattern[i] === 'L' ? L[Number(d)] : [...invert(L[Number(d)])].reverse().join('')).join('')
  const right = [...ean.slice(ean.length === 8 ? 4 : 7)].map(d => invert(L[Number(d)])).join('')
  const bars = '000000000000101' + left + '01010' + right + '101000000000000'
  const w = bars.length * 4, h = 160
  const width = sideways ? h : w, height = sideways ? w : h
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let y = 15; y < h - 15; y++) for (let x = 0; x < w; x++) if (bars[Math.floor(x / 4)] === '1') {
    const i = (sideways ? x * width + y : y * width + x) * 4
    data[i] = data[i + 1] = data[i + 2] = 0
  }
  return { data, width, height }
}
describe('food barcode scanner', () => {
  it('validates GTIN lengths and check digits without accepting arbitrary QR text or URL digits', () => {
    for (const code of ['3017620422003', '96385074', '036000291452', '10012345000017']) expect(foodBarcode(code)).toBe(code)
    for (const value of ['3017620422004', '123', 'https://example.com/3017620422003', 'abc3017620422003', '', null]) expect(foodBarcode(value)).toBeNull()
  })
  it.each(['3017620422003', '96385074', '036000291452'])('actually reads %s from barcode pixels using bundled ZXing', async code => {
    expect(await decodeFoodPixels(picture(code))).toBe(code)
  })
  it('reads a sideways photo with no native BarcodeDetector', async () => {
    expect(await decodeFoodPixels(picture('3017620422003', true))).toBe('3017620422003')
  })
  it('ignores blank and malformed frames instead of making a food search', async () => {
    expect(await decodeFoodPixels({ data: new Uint8ClampedArray(200 * 100 * 4).fill(255), width: 200, height: 100 })).toBeNull()
    expect(await decodeFoodPixels({})).toBeNull()
    expect(await decodeFoodPixels(picture('3017620422004'))).toBeNull()
  })
  it('allows photo cancellation and refuses oversized files before decoding', async () => {
    expect(await decodeFoodPhoto(null)).toBeNull()
    await expect(decodeFoodPhoto({ size: 21 * 1024 * 1024 })).rejects.toThrow('20 МБ')
  })
})
