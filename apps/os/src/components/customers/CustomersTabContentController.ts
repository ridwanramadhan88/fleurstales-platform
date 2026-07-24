import { useMemo, useState } from 'react'
import { useOrdersStore } from '../../store/ordersStore'
import { useCustomerStore } from '../../store/customerStore'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { canEditSection } from '../../config/permissions'
import type { OrderTableRow } from '../../types/orders'
import {
  buildEnrichedCustomers,
  filterAndSortCustomers,
  computeCustomersOverview,
  getOrdersForCustomer,
  type EnrichedCustomer,
} from '../../domain/customerDomain'
import type {
  CustomerSegmentFilter,
  CustomerSortOption,
} from './CustomerFiltersBar'
import type { CustomersTabContentProps } from './CustomersTabContent'

export interface CustomersTabContentViewModel {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  segmentFilter: CustomerSegmentFilter
  sortOption: CustomerSortOption
  displayed: EnrichedCustomer[]
  overview: ReturnType<typeof computeCustomersOverview>
  formatter: Intl.NumberFormat
  avgOrdersPerCustomerLabel: string
  selectedEnriched: EnrichedCustomer | null
  selectedCustomerOrders: OrderTableRow[]
  voucherDialogOpen: boolean
  promoCustomerId: string | null
  onSegmentFilterChange: (value: CustomerSegmentFilter) => void
  onSortOptionChange: (value: CustomerSortOption) => void
  onOpenProfile: (customerId: string) => void
  onCloseProfile: () => void
  onOpenVoucherDialog: () => void
  onCloseVoucherDialog: () => void
  pendingRemoveCustomer: EnrichedCustomer | null
  removeCustomerBlockedReason: string | null
  canRemoveCustomer: boolean
  onAssignPromo: (customerId: string) => void
  onRequestRemoveCustomer: (customerId: string) => void
  onCancelRemoveCustomer: () => void
  onConfirmRemoveCustomer: () => void
}

export const useCustomersTabContentController = ({
  searchQuery,
  onSearchQueryChange,
}: CustomersTabContentProps): CustomersTabContentViewModel => {
  const { customers } = useCustomerStore()
  const removeCustomer = useCustomerStore((state) => state.removeCustomer)
  const role = useUserStore((state) => state.role)
  const permissions = useSettingsStore((state) => state.permissions)
  const canRemoveCustomer = role === 'owner' || canEditSection(role, 'customers', permissions)
  const segmentRules = useCustomerStore((state) => state.segmentRules)
  const allOrders = useOrdersStore((state) => state.orders)

  const [segmentFilter, setSegmentFilter] =
    useState<CustomerSegmentFilter>('all')
  const [sortOption, setSortOption] =
    useState<CustomerSortOption>('most_recent')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  )
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false)
  const [promoCustomerId, setPromoCustomerId] = useState<string | null>(null)
  const [pendingRemoveCustomerId, setPendingRemoveCustomerId] = useState<string | null>(null)

  const enrichedCustomers = useMemo(
    () => buildEnrichedCustomers(customers, allOrders, segmentRules),
    [customers, allOrders, segmentRules],
  )

  const displayed = useMemo(
    () =>
      filterAndSortCustomers(
        enrichedCustomers,
        searchQuery,
        segmentFilter,
        sortOption,
      ),
    [enrichedCustomers, searchQuery, segmentFilter, sortOption],
  )

  const overview = useMemo(
    () => computeCustomersOverview(enrichedCustomers),
    [enrichedCustomers],
  )

  const selectedEnriched =
    selectedCustomerId != null
      ? enrichedCustomers.find(
          (item) => item.profile.id === selectedCustomerId,
        ) ?? null
      : null

  const selectedCustomerOrders =
    selectedEnriched != null
      ? getOrdersForCustomer(selectedEnriched.profile, allOrders)
      : []

  const pendingRemoveCustomer = pendingRemoveCustomerId
    ? enrichedCustomers.find((item) => item.profile.id === pendingRemoveCustomerId) ?? null
    : null
  const activeStatuses = new Set(['pending_verification', 'confirmed', 'processing', 'ready', 'delivering'])
  const removeCustomerBlockedReason = pendingRemoveCustomer
    ? allOrders.some((order) => order.customerId === pendingRemoveCustomer.profile.id && activeStatuses.has(order.status))
      ? 'Resolve the customer’s unfinished orders before removing this CRM profile.'
      : null
    : null


  const closeVoucherDialog = () => {
    setVoucherDialogOpen(false)
    setPromoCustomerId(null)
  }

  return {
    searchQuery,
    onSearchQueryChange,
    segmentFilter,
    sortOption,
    displayed,
    overview,
    formatter: new Intl.NumberFormat('id-ID'),
    avgOrdersPerCustomerLabel: overview.avgOrdersPerCustomer.toFixed(1),
    selectedEnriched,
    selectedCustomerOrders,
    voucherDialogOpen,
    promoCustomerId,
    onSegmentFilterChange: setSegmentFilter,
    onSortOptionChange: setSortOption,
    onOpenProfile: setSelectedCustomerId,
    onCloseProfile: () => setSelectedCustomerId(null),
    onOpenVoucherDialog: () => setVoucherDialogOpen(true),
    onCloseVoucherDialog: closeVoucherDialog,
    pendingRemoveCustomer,
    removeCustomerBlockedReason,
    canRemoveCustomer,
    onAssignPromo: (customerId) => {
      setPromoCustomerId(customerId)
      setVoucherDialogOpen(true)
    },
    onRequestRemoveCustomer: setPendingRemoveCustomerId,
    onCancelRemoveCustomer: () => setPendingRemoveCustomerId(null),
    onConfirmRemoveCustomer: () => {
      if (!pendingRemoveCustomerId || removeCustomerBlockedReason) return
      removeCustomer(pendingRemoveCustomerId)
      setPendingRemoveCustomerId(null)
      setSelectedCustomerId((current) => current === pendingRemoveCustomerId ? null : current)
    },
  }
}
