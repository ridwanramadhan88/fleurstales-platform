import { useMemo, useState } from 'react'
import type { BranchId } from '../../types/orders'
import { useStockStore } from '../../store/stockStore'
import type { StockItem } from '../../store/stockStore'
import { useUserStore } from '../../store/userStore'
import { canEditSection } from '../../config/permissions'
import { useSettingsStore } from '../../store/settingsStore'
import { getBranchStockContext } from '../../domain/stockDomain'
import type { StockStatusFilter, StockTypeFilter } from './StockFiltersBar'
import type { StockItemFormSheetProps } from './StockItemFormSheet'
import type { StockItemDetailSheetProps } from './StockItemDetailSheet'
import type { StockTabContentProps } from './StockTabContent'
import { requestAppConfirmation } from '../ui/app-confirm'

export interface StockTabContentViewModel {
  activeBranch: StockTabContentProps['activeBranch']
  searchQuery: string
  onSearchQueryChange?: (value: string) => void
  statusFilter: StockStatusFilter
  typeFilter: StockTypeFilter
  sheetTarget: StockItem | 'new' | null
  detailItemId: string | null
  detailItem: StockItem | null
  manageMode: boolean
  selectedIds: Set<string>
  branchItems: StockItem[]
  branchTransfers: ReturnType<typeof getBranchStockContext>['branchTransfers']
  branchEvents: ReturnType<typeof getBranchStockContext>['branchEvents']
  filteredItems: StockItem[]
  nonArchivedBranchItems: StockItem[]
  allSelected: boolean
  branchLabel: string
  showingArchivedView: boolean
  canEdit: boolean
  activeFormBranch: BranchId
  detailTransfers: ReturnType<typeof getBranchStockContext>['branchTransfers']
  detailEvents: ReturnType<typeof getBranchStockContext>['branchEvents']
  onStatusFilterChange: (value: StockStatusFilter) => void
  onTypeFilterChange: (value: StockTypeFilter) => void
  onToggleManageMode: () => void
  onOpenCreateSheet: () => void
  onCloseSheet: () => void
  onOpenDetail: (itemId: string) => void
  onCloseDetail: () => void
  onToggleSelect: (itemId: string) => void
  onToggleSelectAll: () => void
  onBulkArchive: () => void
  onBulkUnarchive: () => void
  onBulkDelete: () => void
  onRequestTransfer: StockItemDetailSheetProps['onRequestTransfer']
  onAdvanceTransferStatus: StockItemDetailSheetProps['onAdvanceTransferStatus']
  onRecordLoss: StockItemDetailSheetProps['onRecordLoss']
  onEditDetailItem: () => void
  onToggleDetailArchive: (isArchived: boolean) => void
  onCreateItem: StockItemFormSheetProps['onCreate']
  onUpdateItem: StockItemFormSheetProps['onUpdate']
}

export const useStockTabContentController = ({
  activeBranch,
  searchQuery = '',
  onSearchQueryChange,
}: StockTabContentProps): StockTabContentViewModel => {
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<StockTypeFilter>('all')
  const [sheetTarget, setSheetTarget] = useState<StockItem | 'new' | null>(
    null,
  )
  const [detailItemId, setDetailItemId] = useState<string | null>(null)
  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const actorName = useUserStore((state) => state.name)
  const userRole = useUserStore((state) => state.role)
  const permissions = useSettingsStore((state) => state.permissions)
  const canEdit = canEditSection(userRole, 'stock', permissions)

  const items = useStockStore((state) => state.items)
  const transfers = useStockStore((state) => state.transfers)
  const events = useStockStore((state) => state.events)
  const requestTransfer = useStockStore((state) => state.requestTransfer)
  const updateTransferStatus = useStockStore(
    (state) => state.updateTransferStatus,
  )
  const recordLossOrWriteOff = useStockStore(
    (state) => state.recordLossOrWriteOff,
  )
  const addItem = useStockStore((state) => state.addItem)
  const updateItem = useStockStore((state) => state.updateItem)
  const archiveItems = useStockStore((state) => state.archiveItems)
  const deleteItems = useStockStore((state) => state.deleteItems)

  const {
    branchItems,
    branchTransfers,
    branchEvents,
    filteredItems,
  } = useMemo(
    () =>
      getBranchStockContext({
        items,
        transfers,
        events,
        branch: activeBranch,
        statusFilter,
        typeFilter,
        searchQuery,
      }),
    [items, transfers, events, activeBranch, statusFilter, typeFilter, searchQuery],
  )

  const nonArchivedBranchItems = useMemo(
    () => branchItems.filter((item) => !item.isArchived),
    [branchItems],
  )

  const detailItem = detailItemId
    ? (items.find((item) => item.id === detailItemId) ?? null)
    : null

  const allSelected =
    filteredItems.length > 0 && selectedIds.size === filteredItems.length

  const detailTransfers = detailItem
    ? branchTransfers.filter((transfer) => transfer.itemId === detailItem.id)
    : []
  const detailEvents = detailItem
    ? branchEvents.filter((event) => event.itemId === detailItem.id)
    : []

  return {
    activeBranch,
    searchQuery,
    onSearchQueryChange,
    statusFilter,
    typeFilter,
    sheetTarget,
    detailItemId,
    detailItem,
    manageMode,
    selectedIds,
    branchItems,
    branchTransfers,
    branchEvents,
    filteredItems,
    nonArchivedBranchItems,
    allSelected,
    branchLabel: activeBranch === 'All' ? 'All branches' : activeBranch,
    showingArchivedView: statusFilter === 'archived',
    canEdit,
    activeFormBranch: activeBranch === 'All' ? '' : activeBranch,
    detailTransfers,
    detailEvents,
    onStatusFilterChange: setStatusFilter,
    onTypeFilterChange: setTypeFilter,
    onToggleManageMode: () => {
      setManageMode((previous) => !previous)
      setSelectedIds(new Set())
    },
    onOpenCreateSheet: () => setSheetTarget('new'),
    onCloseSheet: () => setSheetTarget(null),
    onOpenDetail: setDetailItemId,
    onCloseDetail: () => setDetailItemId(null),
    onToggleSelect: (itemId) => {
      setSelectedIds((previous) => {
        const next = new Set(previous)
        if (next.has(itemId)) next.delete(itemId)
        else next.add(itemId)
        return next
      })
    },
    onToggleSelectAll: () => {
      setSelectedIds(
        allSelected
          ? new Set()
          : new Set(filteredItems.map((item) => item.id)),
      )
    },
    onBulkArchive: () => {
      archiveItems(Array.from(selectedIds), true)
      setSelectedIds(new Set())
    },
    onBulkUnarchive: () => {
      archiveItems(Array.from(selectedIds), false)
      setSelectedIds(new Set())
    },
    onBulkDelete: async () => {
      const count = selectedIds.size
      if (count === 0) return
      const confirmed = await requestAppConfirmation({ title: 'Delete stock items?', description: `Delete ${count} item${count === 1 ? '' : 's'}? This cannot be undone.`, confirmLabel: 'Delete', destructive: true })
      if (!confirmed) return
      deleteItems(Array.from(selectedIds))
      setSelectedIds(new Set())
    },
    onRequestTransfer: ({ itemId, fromBranch, toBranch, quantity }) =>
      requestTransfer({ itemId, fromBranch, toBranch, quantity, actor: actorName }),
    onAdvanceTransferStatus: (transferId, status) =>
      updateTransferStatus({ transferId, status, actor: actorName }),
    onRecordLoss: ({ itemId, quantity, kind, reason }) =>
      recordLossOrWriteOff({ itemId, quantity, kind, reason, actor: actorName }),
    onEditDetailItem: () => {
      if (detailItem) setSheetTarget(detailItem)
      setDetailItemId(null)
    },
    onToggleDetailArchive: (isArchived) => {
      if (detailItem) archiveItems([detailItem.id], isArchived)
    },
    onCreateItem: addItem,
    onUpdateItem: (params) => {
      const { itemId, ...patch } = params
      updateItem(itemId, patch)
    },
  }
}
