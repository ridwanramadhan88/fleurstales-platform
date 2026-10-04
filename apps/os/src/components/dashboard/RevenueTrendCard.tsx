/**
 * @file RevenueTrendCard.tsx
 * @description Owner home: confirmed revenue over the last 7 days as simple
 * bars, with a link to the full Revenue screen. It uses the same numbers as
 * the Revenue screen (payments Finance has confirmed, less refunds), so the
 * two never disagree.
 */

import type { FC } from 'react'
import { ArrowRight } from 'lucide-react'
import type { BranchFilter } from '../../types/orders'
import { useFinanceStore } from '../../store/financeStore'
import { getCashRevenueTrend, resolveCashRange } from '../../domain/cashRevenueDomain'
import { surfaceCardClass } from '../ui/card'

const idr = new Intl.NumberFormat('id-ID')

export const RevenueTrendCard: FC<{ activeBranch: BranchFilter; onOpenRevenue: () => void }> = ({ activeBranch, onOpenRevenue }) => {
  const transactions = useFinanceStore((state) => state.transactions)
  const days = getCashRevenueTrend(transactions, {
    branch: activeBranch === 'All' ? 'all' : activeBranch,
    range: resolveCashRange({ days: 7 }),
  })
  const max = Math.max(1, ...days.map((day) => Math.max(0, day.totalIdr)))
  const total = days.reduce((sum, day) => sum + day.totalIdr, 0)

  return (
    <section aria-label="Revenue last 7 days" className={`${surfaceCardClass('standard')} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Confirmed revenue, last 7 days</h2>
          <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{`Rp ${idr.format(total)}`}</p>
        </div>
        <button type="button" onClick={onOpenRevenue} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-semibold text-primary hover:bg-primary/10">
          Open revenue <ArrowRight className="size-3.5" />
        </button>
      </div>
      <div className="mt-4 flex items-end gap-2" role="list">
        {days.map((day) => (
          <div key={day.label} role="listitem" className="flex flex-1 flex-col items-center gap-1" title={`${day.label} · Rp ${idr.format(day.totalIdr)}`}>
            <div className="flex h-20 w-full items-end">
              <div className={`w-full rounded-t-md ${day.totalIdr > 0 ? 'bg-primary/70' : 'bg-muted'}`} style={{ height: `${Math.max(4, (Math.max(0, day.totalIdr) / max) * 100)}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground">{day.label.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
