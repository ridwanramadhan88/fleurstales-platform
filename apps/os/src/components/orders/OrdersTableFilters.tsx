import type { FC } from 'react'
import { FilePenLine } from 'lucide-react'
import { OrdersExportButton } from './OrdersExportDialog'
import { FilterChip } from '../ui/chip'
import type { OrdersTableViewModel } from './OrdersTableViewController'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

interface OrdersTableFiltersProps { viewModel: OrdersTableViewModel }

/**
 * One line above the work list: what the list shows, saved drafts, and the
 * Excel download. The list is always in priority order, so there is no sort
 * menu or status chips any more.
 */
export const OrdersTableFilters: FC<OrdersTableFiltersProps> = ({ viewModel }) => {
  const copy = useBilingualCopy()
  const { draftCount, isDraftMode, scopeLabel, exportableOrders, exportBranch, exportDefaultRange, exportDefaultStatus, onToggleDrafts } = viewModel
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold text-muted-foreground">{scopeLabel}</p>
      <div className="flex items-center gap-2">
        {(draftCount > 0 || isDraftMode) && (
          <FilterChip active={isDraftMode} onClick={onToggleDrafts} className="h-11 shrink-0 gap-1.5 md:h-9">
            <FilePenLine className="size-3.5" />
            {copy('Drafts', 'Draf')}
            <span className="tabular-nums">{draftCount}</span>
          </FilterChip>
        )}
        {!isDraftMode && (
          <OrdersExportButton orders={exportableOrders} branch={exportBranch} defaultRange={exportDefaultRange} defaultStatus={exportDefaultStatus} />
        )}
      </div>
    </div>
  )
}
