/**
 * @file RevenueTrendCard.tsx
 * @description Owner home: revenue from finished orders over the last 7 days
 * as simple bars, with a link to the full Revenue screen.
 */

import type { FC } from 'react'
import { ArrowRight } from 'lucide-react'
import type { BranchFilter } from '../../types/orders'
import { useOrdersStore } from '../../store/ordersStore'
import { getDailyRevenue } from '../../domain/homeWorkDomain'
import { getLocalDateString, nowInJakarta } from '../../domain/orderTimingDomain'
import { formatHumanDate } from '../../lib/humanDates'
import { surfaceCardClass } from '../ui/card'

const idr = new Intl.NumberFormat('id-ID')

export const RevenueTrendCard: FC<{ activeBranch: BranchFilter; onOpenRevenue: () => void }> = ({ activeBranch, onOpenRevenue }) => {
  const orders = useOrdersStore((state) => state.orders)
  const scoped = activeBranch === 'All' ? orders : orders.filter((order) => order.branch === activeBranch)
  const days = getDailyRevenue({ orders: scoped, today: getLocalDateString(nowInJakarta()) })
  const max = Math.max(1, ...days.map((day) => day.totalIdr))
  const total = days.reduce((sum, day) => sum + day.totalIdr, 0)

  return (
    <section aria-label="Revenue last 7 days" className={`${surfaceCardClass('standard')} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Revenue last 7 days</h2>
          <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{`Rp ${idr.format(total)}`}</p>
        </div>
        <button type="button" onClick={onOpenRevenue} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-semibold text-primary hover:bg-primary/10">
          Open revenue <ArrowRight className="size-3.5" />
        </button>
      </div>
      <div className="mt-4 flex items-end gap-2" role="list">
        {days.map((day) => (
          <div key={day.date} role="listitem" className="flex flex-1 flex-col items-center gap-1" title={`${formatHumanDate(day.date)} · Rp ${idr.format(day.totalIdr)}`}>
            <div className="flex h-20 w-full items-end">
              <div className={`w-full rounded-t-md ${day.totalIdr > 0 ? 'bg-primary/70' : 'bg-muted'}`} style={{ height: `${Math.max(4, (day.totalIdr / max) * 100)}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground">{formatHumanDate(day.date).split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
