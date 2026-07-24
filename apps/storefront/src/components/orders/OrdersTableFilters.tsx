import type { FC } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from 'lucide-react'
import { ChipRow, FilterChip } from '../ui/chip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { STATUS_GROUP_FILTER_OPTIONS, type UiStatusGroup } from './orderTableLabels'
import type { OrdersListSortKey, OrdersTableViewModel } from './OrdersTableViewController'
import { surfaceCardClass } from '../ui/card'

interface OrdersTableFiltersProps { viewModel: OrdersTableViewModel }

const SORT_OPTIONS: Array<{ id: OrdersListSortKey; label: string }> = [
  { id: 'status', label: 'Status workflow' },
  { id: 'eta', label: 'Expected time' },
  { id: 'order', label: 'Order number' },
]

export const OrdersTableFilters: FC<OrdersTableFiltersProps> = ({ viewModel }) => {
  const { statusGroupFilter, newOrderCount, draftCount, isDraftMode, scopedOrderCount, displayedOrderCount, scopeLabel, sortKey, sortDirection, canExportFinishedCsv, onStatusGroupFilterChange, onSortChange, onExportFinishedCsv } = viewModel
  const DirectionIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown
  return (
    <div className={surfaceCardClass('dense', 'space-y-3 sm:bg-transparent sm:p-0 sm:shadow-none sm:ring-0')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground"><span className="font-semibold">{scopeLabel}</span><span className="text-muted-foreground"> · Showing {displayedOrderCount} of {scopedOrderCount}</span></p>
        {!isDraftMode && <div className="flex items-center gap-2">
          {statusGroupFilter === 'finished' && (
            <button type="button" onClick={onExportFinishedCsv} disabled={!canExportFinishedCsv} className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium disabled:opacity-40">
              <Download className="size-4" /> Export CSV
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Sort orders by ${sortKey}, ${sortDirection}`} title="Sort orders" className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-accent">
                <ArrowUpDown className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Sort orders</DropdownMenuLabel><DropdownMenuSeparator />
              {SORT_OPTIONS.map((option) => <DropdownMenuItem key={option.id} onSelect={() => onSortChange(option.id)}>
                <span>{option.label}</span>
                {sortKey === option.id && <DirectionIcon className="ml-auto size-4" />}
              </DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>}
      </div>
      <ChipRow activeKey={statusGroupFilter} edge="card" className="pr-5">
        {STATUS_GROUP_FILTER_OPTIONS.flatMap((option) => {
          const chips = [<FilterChip key={option.id} active={statusGroupFilter === option.id} onClick={() => onStatusGroupFilterChange(option.id as UiStatusGroup | 'all')} className="shrink-0">{option.label}{option.id === 'new' && newOrderCount > 0 && <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold text-primary-foreground">{newOrderCount}</span>}</FilterChip>]
          if (option.id === 'new') chips.push(<FilterChip key="drafts" active={statusGroupFilter === 'drafts'} onClick={() => onStatusGroupFilterChange('drafts')} className="shrink-0">Drafts{draftCount > 0 && <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted-foreground/20 px-1 text-2xs font-semibold">{draftCount}</span>}</FilterChip>)
          return chips
        })}
      </ChipRow>
    </div>
  )
}
