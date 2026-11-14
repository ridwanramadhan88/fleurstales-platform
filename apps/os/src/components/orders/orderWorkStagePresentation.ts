/**
 * @file orderWorkStagePresentation.ts
 * @description How each Admin work stage looks and reads in the Orders list:
 * label, action, colour and the one-line "why now" reason. Colours are the
 * Apple system palette the OS already uses (indigo, teal, blue, purple,
 * green); red is kept for time pressure only.
 */

import type { LucideIcon } from 'lucide-react'
import { Clock3, CreditCard, Flower2, Inbox, PackageCheck, RotateCcw, Truck, UserRound, CheckCircle2, XCircle } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import type { OrderPriority, OrderWorkStage } from '../../domain/orderWorkStageDomain'

type Copy = (en: string, id: string) => string

export interface OrderWorkStageStyle {
  icon: LucideIcon
  /** Pill background + text. */
  pillClass: string
  /** Filled icon circle inside the pill. */
  dotClass: string
}

export const ORDER_WORK_STAGE_STYLE: Record<OrderWorkStage, OrderWorkStageStyle> = {
  confirm: { icon: Inbox, pillClass: 'bg-[#5856D6]/10 text-[#3F3DB8] dark:text-[#A5A4F2]', dotClass: 'bg-[#5856D6]' },
  payment: { icon: CreditCard, pillClass: 'bg-[#30B0C7]/12 text-[#16788A] dark:text-[#7FD3E2]', dotClass: 'bg-[#30B0C7]' },
  assign: { icon: UserRound, pillClass: 'bg-primary/10 text-[#0062CC] dark:text-[#7DB8FF]', dotClass: 'bg-primary' },
  photo_in: { icon: Flower2, pillClass: 'bg-[#AF52DE]/10 text-[#8E3DB5] dark:text-[#D7A6F0]', dotClass: 'bg-[#AF52DE]' },
  handover: { icon: PackageCheck, pillClass: 'bg-[#34C759]/12 text-[#1E7A34] dark:text-[#7EDB95]', dotClass: 'bg-[#34C759]' },
  arranging: { icon: Clock3, pillClass: 'bg-muted text-muted-foreground', dotClass: 'bg-muted-foreground/70' },
  delivering: { icon: Truck, pillClass: 'bg-muted text-muted-foreground', dotClass: 'bg-muted-foreground/70' },
  refunding: { icon: RotateCcw, pillClass: 'bg-muted text-muted-foreground', dotClass: 'bg-muted-foreground/70' },
  done: { icon: CheckCircle2, pillClass: 'bg-success/10 text-success', dotClass: 'bg-success' },
  cancelled: { icon: XCircle, pillClass: 'bg-muted text-muted-foreground', dotClass: 'bg-muted-foreground/60' },
}

export const getOrderWorkStageLabel = (
  stage: OrderWorkStage,
  order: Pick<OrderTableRow, 'fulfillment' | 'status'>,
  copy: Copy,
): string => {
  switch (stage) {
    case 'confirm': return copy('Needs confirming', 'Perlu dikonfirmasi')
    case 'payment': return copy('Confirm payment', 'Konfirmasi bayar')
    case 'assign': return copy('Assign florist', 'Tugaskan perangkai')
    case 'photo_in': return copy('Photo in', 'Foto masuk')
    case 'handover': return order.fulfillment === 'delivery' ? copy('Ready to send', 'Siap dikirim') : copy('Ready for pickup', 'Siap diambil')
    case 'arranging': return copy('Being arranged', 'Sedang dirangkai')
    case 'delivering': return copy('Out for delivery', 'Dalam pengiriman')
    case 'refunding': return copy('Refund pending', 'Menunggu pengembalian dana')
    case 'done': return order.status === 'picked_up' ? copy('Picked up', 'Sudah diambil') : copy('Delivered', 'Terkirim')
    case 'cancelled': return order.status === 'failed' ? copy('Failed', 'Gagal') : copy('Cancelled', 'Dibatalkan')
  }
}

/** The button label in the list: what one tap does. */
export const getOrderWorkActionLabel = (
  stage: OrderWorkStage,
  order: Pick<OrderTableRow, 'fulfillment'>,
  copy: Copy,
): string => {
  switch (stage) {
    case 'confirm': return copy('Review', 'Tinjau')
    case 'payment': return copy('Record payment', 'Catat bayar')
    case 'assign': return copy('Assign', 'Tugaskan')
    case 'photo_in': return copy('Mark ready', 'Tandai siap')
    case 'handover': return order.fulfillment === 'delivery' ? copy('Send', 'Kirim') : copy('Hand over', 'Serahkan')
    case 'delivering': return copy('Mark delivered', 'Tandai terkirim')
    default: return copy('Open', 'Buka')
  }
}

const hhmm = (date: Date): string => `${String(date.getHours()).padStart(2, '0')}.${String(date.getMinutes()).padStart(2, '0')}`

/** "45 mnt lagi", "1 j 30 mnt lagi", "Terlambat 20 mnt". */
export const formatMinutesLeft = (minutes: number, copy: Copy): string => {
  const abs = Math.abs(minutes)
  const hours = Math.floor(abs / 60)
  const rest = abs % 60
  const spanEn = hours > 0 ? `${hours} h${rest ? ` ${rest} min` : ''}` : `${rest} min`
  const spanId = hours > 0 ? `${hours} j${rest ? ` ${rest} mnt` : ''}` : `${rest} mnt`
  return minutes < 0 ? copy(`${spanEn} late`, `Terlambat ${spanId}`) : copy(`${spanEn} left`, `${spanId} lagi`)
}

/** One line telling the Admin why this order sits where it does. */
export const getOrderWorkReason = (
  order: Pick<OrderTableRow, 'fulfillment'>,
  priority: OrderPriority,
  copy: Copy,
): string => {
  const kindEn = order.fulfillment === 'delivery' ? 'delivery' : 'pickup'
  const kindId = order.fulfillment === 'delivery' ? 'antar' : 'ambil'
  if (!priority.scheduledAt || !priority.deadline) return copy('No pickup or delivery time yet', 'Belum ada jam ambil/antar')
  const at = hhmm(priority.scheduledAt)
  const start = hhmm(priority.deadline)
  switch (priority.stage) {
    case 'confirm':
    case 'payment':
    case 'assign':
      if (priority.timeBucket === 'tomorrow' || priority.timeBucket === 'later') {
        return priority.stage === 'payment'
          ? copy('Must be paid before it is made', 'Perlu dibayar sebelum dirangkai')
          : copy(`Arrange before ${kindEn} ${at}`, `Rangkai sebelum ${kindId} ${at}`)
      }
      return copy(`Start arranging by ${start} for ${kindEn} at ${at}`, `Harus mulai dirangkai ${start} agar siap ${kindId} ${at}`)
    case 'photo_in':
      return copy('The florist uploaded the finish photo', 'Foto hasil sudah diunggah perangkai')
    case 'handover':
      return copy(`Ready, ${kindEn} at ${at}`, `Sudah siap, ${kindId} ${at}`)
    case 'arranging':
      return copy(`Florist is working, ${kindEn} at ${at}`, `Sedang dirangkai, ${kindId} ${at}`)
    case 'delivering':
      return copy('With the courier', 'Sedang dibawa kurir')
    case 'refunding':
      return copy('Finance is returning the money; the order is cancelled once it is done', 'Keuangan sedang mengembalikan uang; pesanan batal setelah selesai')
    default:
      return ''
  }
}
