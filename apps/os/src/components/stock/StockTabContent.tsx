/**
 * @file StockTabContent.tsx
 * @description Inventory sub-tab content inside the merged Product tab.
 * Structure:
 * 1. Overview — StockSummaryCards.
 * 2. Filter category — StockFiltersBar (status + category).
 * 3. Simple list — StockItemRow per item (no inline controls).
 * 4. Add item — opens StockItemFormSheet in create mode.
 * 5. Manage (bulk) — select rows, Archive / Delete in bulk via BulkActionBar.
 * 6. Row tap — opens StockItemDetailSheet with full info + Edit.
 *
 * Data flow: stockStore (data) → stockDomain (logic) → UI (this file).
 */

import type { FC } from 'react'
import type { BranchFilter } from '../../types/orders'
import { StockSummaryCards } from './StockSummaryCards'
import { StockFiltersBar } from './StockFiltersBar'
import { StockItemRow } from './StockItemRow'
import { StockItemDetailSheet } from './StockItemDetailSheet'
import { StockItemFormSheet } from './StockItemFormSheet'
import { BulkActionBar } from '../product/BulkActionBar'
import { ListPlus, ListChecks } from 'lucide-react'
import type { StockTabContentViewModel } from './StockTabContentController'

/**
 * @description Props for the StockTabContent component.
 */
export interface StockTabContentProps {
  /** Active branch context from the main layout. */
  activeBranch: BranchFilter
  /** Search query owned by the main top bar (matches item name). */
  searchQuery?: string
  /** Handler fired when the search query should change (desktop filter bar). */
  onSearchQueryChange?: (value: string) => void
}

/**
 * @description Main Inventory content wired to the stock store.
 */
export const StockTabContent: FC<StockTabContentViewModel> = ({
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  typeFilter,
  sheetTarget,
  detailItemId,
  detailItem,
  manageMode,
  selectedIds,
  branchTransfers,
  filteredItems,
  nonArchivedBranchItems,
  allSelected,
  branchLabel,
  showingArchivedView,
  canEdit,
  activeFormBranch,
  detailTransfers,
  detailEvents,
  onStatusFilterChange,
  onTypeFilterChange,
  onToggleManageMode,
  onOpenCreateSheet,
  onCloseSheet,
  onOpenDetail,
  onCloseDetail,
  onToggleSelect,
  onToggleSelectAll,
  onBulkArchive,
  onBulkUnarchive,
  onBulkDelete,
  onRequestTransfer,
  onAdvanceTransferStatus,
  onRecordLoss,
  onEditDetailItem,
  onToggleDetailArchive,
  onCreateItem,
  onUpdateItem,
}) => {
  return (
    <section className="space-y-3">
      {/* 1. Overview */}
      <StockSummaryCards
        items={nonArchivedBranchItems}
        transfers={branchTransfers}
        onSelectStatus={onStatusFilterChange}
      />

      {/* 2. Filter type (+ status) */}
      <StockFiltersBar
        branchLabel={branchLabel}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        typeFilter={typeFilter}
        onTypeFilterChange={onTypeFilterChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />

      {/* Toolbar: item count, Manage toggle, Add item */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Showing {filteredItems.length} of {nonArchivedBranchItems.length} items
          {showingArchivedView && ' (archived)'}
        </p>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleManageMode}
              className={`inline-flex items-center rounded-full text-sm font-medium transition ${ manageMode ? 'bg-primary text-primary-foreground shadow-ios-sm' : 'border border-border bg-card text-muted-foreground hover:bg-accent' } h-11 rounded-full px-[18px] gap-2 whitespace-nowrap`}
            >
              <ListChecks className="size-3.5" />
              {manageMode ? 'Done' : 'Manage'}
            </button>
            <button
              type="button"
              onClick={onOpenCreateSheet}
              className="inline-flex items-center cursor-pointer rounded-full bg-primary text-sm font-medium text-white shadow-ios-sm hover:bg-primary/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
            >
              <ListPlus className="size-3.5" />
              Add item
            </button>
          </div>
        )}
      </div>

      {/* 5. Bulk manage toolbar */}
      {manageMode && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={filteredItems.length}
          allSelected={allSelected}
          onToggleSelectAll={onToggleSelectAll}
          onArchive={!showingArchivedView ? onBulkArchive : undefined}
          onUnarchive={showingArchivedView ? onBulkUnarchive : undefined}
          onDelete={onBulkDelete}
          onDone={onToggleManageMode}
        />
      )}

      {/* 3. Simple item list */}
      <section aria-label="Stock items" className="space-y-2">
        {filteredItems.length === 0 ? (
          <p className="rounded-lg bg-card px-3 py-3 text-xs text-muted-foreground ring-1 ring-border/60">
            No stock items match these filters. Try changing status, category, or search.
          </p>
        ) : (
          <div className="space-y-1.5">
            {filteredItems.map((item) => (
              <StockItemRow
                key={item.id}
                item={item}
                transfers={branchTransfers.filter(
                  (transfer) => transfer.itemId === item.id,
                )}
                manageMode={manageMode}
                selected={selectedIds.has(item.id)}
                onToggleSelect={() => onToggleSelect(item.id)}
                onOpenDetail={() => onOpenDetail(item.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 6. Detail sheet */}
      <StockItemDetailSheet
        open={detailItemId !== null}
        item={detailItem}
        transfers={
          detailTransfers
        }
        events={
          detailEvents
        }
        onClose={onCloseDetail}
        onRequestTransfer={onRequestTransfer}
        onAdvanceTransferStatus={onAdvanceTransferStatus}
        onRecordLoss={onRecordLoss}
        onEditRequest={onEditDetailItem}
        onToggleArchive={onToggleDetailArchive}
        canEdit={canEdit}
      />

      {/* 4. Add / edit item popup */}
      <StockItemFormSheet
        open={sheetTarget !== null}
        onClose={onCloseSheet}
        // Creating/editing a stock item always needs one real branch, even
        // while viewing the 'All' rollup — default to Kedamaian in that case.
        activeBranch={activeFormBranch}
        item={sheetTarget !== 'new' ? sheetTarget : null}
        onCreate={onCreateItem}
        onUpdate={onUpdateItem}
      />
    </section>
  )
}

export default StockTabContent
