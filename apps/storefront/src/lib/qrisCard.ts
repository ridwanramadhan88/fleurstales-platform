/**
 * Downloadable QRIS payment image — the locked template (25 Nov 2026,
 * canvas https://claude.ai/artifact/6Wny5WBK2NcpWJQFb8wJAS): 1080×1480,
 * cream background, logo, shop name + NMID, QR in a white card with a soft
 * pink border, amount in pink, order number and customer name in green.
 * Kept identical in the Storefront and the Business OS.
 */
import QRCode from 'qrcode'
import logoIconUrl from '../assets/qris-card/logo-icon.svg'
import logoTypeUrl from '../assets/qris-card/logo-type.svg'
import rocBoldUrl from '../assets/qris-card/RocGrotesk-Bold.woff2'
import rocMediumUrl from '../assets/qris-card/RocGrotesk-Medium.woff2'

export interface QrisCardInput {
  payload: string
  amountIdr: number
  branchName: string | null
  nmid: string
  orderNumber: string
  customerName: string | null
}

const WIDTH = 1080
const HEIGHT = 1480
const CREAM = '#fdf6ef'
const INK = '#141414'
const MUTED = '#5a5a5a'
const FOOTER = '#6b6b6b'
const PINK_RULE = '#f684b1'
const PINK_BORDER = '#f9c6da'
const PINK_AMOUNT = '#db4f8a'
const GREEN = '#057640'
const FONT = '"Roc Grotesk QRIS", "Inter", "Helvetica Neue", Arial, sans-serif'

export const formatQrisRupiah = (amountIdr: number): string =>
  `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(amountIdr)))}`

/** Shop name shown on the image: the branch name from the system, not the name inside the QR. */
export const qrisShopName = (branchName: string | null): string =>
  `FLEURSTALES${branchName ? ` ${branchName.toUpperCase()}` : ''}`

export const qrisCardFileName = (orderNumber: string): string =>
  `QRIS-${orderNumber.replace(/[^A-Za-z0-9-]/g, '')}.png`

/** Crisp SVG of the QR for on-screen display. */
export const qrisSvg = (payload: string): Promise<string> =>
  QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: INK, light: '#ffffff' } })

let fontsReady: Promise<void> | null = null
const loadFonts = (): Promise<void> => {
  if (fontsReady) return fontsReady
  fontsReady = (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return
    const faces = [
      new FontFace('Roc Grotesk QRIS', `url(${rocBoldUrl}) format("woff2")`, { weight: '700' }),
      new FontFace('Roc Grotesk QRIS', `url(${rocMediumUrl}) format("woff2")`, { weight: '500' }),
    ]
    await Promise.all(faces.map(async (face) => {
      try {
        document.fonts.add(await face.load())
      } catch {
        // fall back to the system font
      }
    }))
  })()
  return fontsReady
}

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })

const fitText = (context: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number): number => {
  let current = size
  context.font = `${weight} ${current}px ${FONT}`
  while (current > 18 && context.measureText(text).width > maxWidth) {
    current -= 2
    context.font = `${weight} ${current}px ${FONT}`
  }
  return current
}

const ellipsize = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
  if (context.measureText(text).width <= maxWidth) return text
  let value = text
  while (value.length > 1 && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1)
  return `${value.trimEnd()}…`
}

const roundedRect = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()
}

/** Draws the template and returns a PNG. */
export const drawQrisCard = async (input: QrisCardInput): Promise<Blob> => {
  await loadFonts()
  const [icon, type] = await Promise.all([loadImage(logoIconUrl), loadImage(logoTypeUrl)])
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('QRIS_CARD_UNAVAILABLE')
  const center = WIDTH / 2
  const textWidth = WIDTH - 2 * 88

  context.fillStyle = CREAM
  context.fillRect(0, 0, WIDTH, HEIGHT)
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'

  let y = 88
  // Logo: icon 64px tall + logotype 40px tall, 20px apart, centred.
  const iconWidth = icon ? (icon.naturalWidth / icon.naturalHeight) * 64 : 0
  const typeWidth = type ? (type.naturalWidth / type.naturalHeight) * 40 : 0
  const logoWidth = iconWidth + (icon && type ? 20 : 0) + typeWidth
  let x = center - logoWidth / 2
  if (icon) { context.drawImage(icon, x, y, iconWidth, 64); x += iconWidth + 20 }
  if (type) context.drawImage(type, x, y + 12, typeWidth, 40)
  y += 64 + 44

  // Shop name + NMID + pink rule.
  context.fillStyle = INK
  const nameSize = fitText(context, qrisShopName(input.branchName), 700, 48, textWidth)
  y += nameSize
  context.fillText(qrisShopName(input.branchName), center, y)
  y += 8 + 26
  context.fillStyle = MUTED
  context.font = `500 26px ${FONT}`
  context.fillText(`NMID ${input.nmid}`, center, y)
  y += 16
  context.fillStyle = PINK_RULE
  roundedRect(context, center - 32, y, 64, 4, 2)
  context.fill()
  y += 4 + 44

  // White card with the QR.
  const card = 580 + 2 * 44
  context.fillStyle = '#ffffff'
  roundedRect(context, center - card / 2, y, card, card, 36)
  context.fill()
  context.lineWidth = 3
  context.strokeStyle = PINK_BORDER
  roundedRect(context, center - card / 2 + 1.5, y + 1.5, card - 3, card - 3, 34.5)
  context.stroke()
  const qr = QRCode.create(input.payload, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const cell = Math.floor(580 / size)
  const qrSide = cell * size
  const qrX = Math.round(center - qrSide / 2)
  const qrY = Math.round(y + (card - qrSide) / 2)
  context.fillStyle = INK
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (qr.modules.get(row, column)) context.fillRect(qrX + column * cell, qrY + row * cell, cell, cell)
    }
  }
  y += card + 44

  // Amount.
  context.fillStyle = MUTED
  context.font = `500 28px ${FONT}`
  y += 28
  context.fillText('Total bayar', center, y)
  y += 10 + 96
  context.fillStyle = PINK_AMOUNT
  fitText(context, formatQrisRupiah(input.amountIdr), 700, 96, textWidth)
  context.fillText(formatQrisRupiah(input.amountIdr), center, y)

  // Order number + customer name.
  context.fillStyle = GREEN
  context.font = `500 28px ${FONT}`
  y += 14 + 28
  context.fillText(`Pesanan ${input.orderNumber}`, center, y)
  if (input.customerName?.trim()) {
    y += 10 + 28
    context.fillText(ellipsize(context, `a.n. ${input.customerName.trim()}`, textWidth), center, y)
  }

  // Footer.
  context.fillStyle = FOOTER
  context.font = `500 24px ${FONT}`
  context.fillText('Scan dari aplikasi bank atau e-wallet berlogo QRIS', center, HEIGHT - 72)

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('QRIS_CARD_UNAVAILABLE'))), 'image/png'),
  )
}

/** Shares the image on phones that can (save to gallery / WhatsApp), otherwise downloads it. */
export const saveQrisCard = async (blob: Blob, fileName: string): Promise<'shared' | 'downloaded'> => {
  const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: 'image/png' }) : null
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
  if (file && typeof nav.share === 'function' && nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: fileName })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
