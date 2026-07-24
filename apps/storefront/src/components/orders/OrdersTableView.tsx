/**
 * @file OrdersTableView.tsx
 * @description Responsive orders list shell. Filters, desktop rows, mobile
 * cards, and quick-action modals live in focused OrdersTable* sections.
 */

import type { FC } from 'react'
import { useLayoutEffect, useRef } from 'react'
import type { OrdersSubTabId } from './OrdersSubTabs'
import type { DateRange } from 'react-day-picker'
import type { BranchFilter, OrderStatus } from '../../types/orders'
import { OrdersDesktopTable } from './OrdersDesktopTable'
import { OrdersMobileCards } from './OrdersMobileCards'
import { OrdersTableFilters } from './OrdersTableFilters'
import { OrdersTableModals } from './OrdersTableModals'
import { OrderDraftsList } from './OrderDraftsList'
import type { OrdersTableViewModel } from './OrdersTableViewController'

export type OrderStatusFilter = 'all' | OrderStatus

export interface OrdersTableViewProps {
  dateRange?: DateRange
  activeScope: OrdersSubTabId
  activeBranch: BranchFilter
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  /**
   * Order number to auto-open the details panel for on mount/update, e.g.
   * when arriving here via a notification deep-link. Consumed once by the
   * controller; changing it again (even to the same value after a clear)
   * re-opens the panel.
   */
  initialSelectedOrderNumber?: string | null
  /** Called once the deep-linked order number above has been consumed, so the caller can clear it. */
  onInitialSelectedOrderNumberConsumed?: () => void
  onOpenDraft?: (draftId: string) => void
  initialStatusGroupFilter?: 'finished'
}

function useFlipList(keys: string[]) {
  const rectsRef = useRef<Map<string, DOMRect>>(new Map())
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map())
  const keysSignature = keys.join('|')

  const setNodeRef = (key: string) => (node: HTMLElement | null) => {
    if (node) {
      nodesRef.current.set(key, node)
    } else {
      nodesRef.current.delete(key)
    }
  }

  useLayoutEffect(() => {
    const newRects = new Map<string, DOMRect>()
    nodesRef.current.forEach((node, key) => {
      newRects.set(key, node.getBoundingClientRect())
    })

    newRects.forEach((newRect, key) => {
      const node = nodesRef.current.get(key)
      const oldRect = rectsRef.current.get(key)
      if (!node || !oldRect) return
      const deltaY = oldRect.top - newRect.top
      if (Math.abs(deltaY) < 1) return

      node.style.transition = 'none'
      node.style.transform = `translateY(${deltaY}px)`
      node.getBoundingClientRect()
      requestAnimationFrame(() => {
        node.style.transition = 'transform 320ms ease'
        node.style.transform = ''
      })
    })

    rectsRef.current = newRects
  }, [keysSignature])

  return setNodeRef
}

export const OrdersTableView: FC<OrdersTableViewModel> = (viewModel) => {
  const { orderKeys } = viewModel
  const setDesktopRowRef = useFlipList(orderKeys)
  const setCardRef = useFlipList(orderKeys)

  return (
    <section aria-label="Orders list" className="space-y-3">
      <OrdersTableFilters viewModel={viewModel} />
      {viewModel.isDraftMode ? (
        <OrderDraftsList
          drafts={viewModel.visibleDrafts}
          onResume={viewModel.onResumeDraft}
          onDelete={viewModel.onDeleteDraft}
        />
      ) : (
        <>
          <OrdersDesktopTable
            viewModel={viewModel}
            setDesktopRowRef={setDesktopRowRef}
          />
          <OrdersMobileCards viewModel={viewModel} setCardRef={setCardRef} />
        </>
      )}
      <OrdersTableModals viewModel={viewModel} />
    </section>
  )
}
