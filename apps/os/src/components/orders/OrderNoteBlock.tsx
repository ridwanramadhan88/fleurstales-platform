import type { FC } from 'react'
import { Mail, StickyNote } from 'lucide-react'
import type { OrderTableRow } from '../../types/orders'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

/**
 * The order note and greeting card, always open and in the one warm colour
 * the order windows use, so they are the first thing read. Renders nothing
 * when the order has neither.
 */
export const OrderNoteBlock: FC<{
  order: Pick<OrderTableRow, 'orderNote' | 'internalNote' | 'greetingMessage' | 'giftMessage' | 'greetingCardName'>
  compact?: boolean
}> = ({ order, compact }) => {
  const copy = useBilingualCopy()
  const note = (order.orderNote ?? order.internalNote)?.trim()
  const greeting = (order.greetingMessage ?? order.giftMessage)?.trim()
  const cardName = order.greetingCardName?.trim()
  if (!note && !greeting) return null

  return (
    <section
      aria-label={copy('Note and greeting card', 'Catatan dan kartu ucapan')}
      className={`rounded-2xl bg-[#FFFAE6] ring-1 ring-[#F5E7B0] dark:bg-[#3A3000] dark:ring-[#5C4A00] ${compact ? 'space-y-3 p-3.5' : 'space-y-3.5 p-4'}`}
    >
      {note && (
        <div className="flex gap-3">
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#FFCC00] text-[#1D1D21]"><StickyNote className="size-3.5" /></span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{copy('Order note', 'Catatan pesanan')}</p>
            <p className={`mt-0.5 whitespace-pre-wrap font-semibold leading-snug text-foreground ${compact ? 'text-[15px]' : 'text-base'}`}>{note}</p>
          </div>
        </div>
      )}
      {greeting && (
        <div className="flex gap-3">
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#1D1D21] ring-1 ring-[#F5E7B0] dark:bg-transparent dark:text-foreground"><Mail className="size-3.5" /></span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {cardName ? copy(`Greeting card from ${cardName}`, `Kartu ucapan dari ${cardName}`) : copy('Greeting card', 'Kartu ucapan')}
            </p>
            <p className={`mt-0.5 whitespace-pre-wrap leading-relaxed text-foreground ${compact ? 'text-sm' : 'text-[15px]'}`}>{greeting}</p>
          </div>
        </div>
      )}
    </section>
  )
}
