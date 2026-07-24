import { useState } from 'react'
import { useCustomerStore } from '../../store/customerStore'
import { useUserStore } from '../../store/userStore'
import type { CustomerSegmentRules } from '../../store/customerStoreTypes'

export interface CustomerSegmentRulesSettingsViewModel {
  isOwner: boolean
  isEditing: boolean
  segmentRules: CustomerSegmentRules
  summaryLabel: string
  onToggleEditing: () => void
  onSetSegmentRules: (patch: Partial<CustomerSegmentRules>) => void
}

export const useCustomerSegmentRulesSettingsController =
  (): CustomerSegmentRulesSettingsViewModel => {
    const role = useUserStore((state) => state.role)
    const isOwner = role === 'owner'
    const segmentRules = useCustomerStore((state) => state.segmentRules)
    const setSegmentRules = useCustomerStore((state) => state.setSegmentRules)
    const [isEditing, setIsEditing] = useState(false)

    const spend = `Rp ${segmentRules.minLifetimeSpend.toLocaleString('id-ID')} spend`
    const orders = `${segmentRules.minOrderCount} orders`
    const summaryLabel =
      segmentRules.mode === 'spend'
        ? `>= ${spend}`
        : segmentRules.mode === 'orders'
          ? `>= ${orders}`
          : segmentRules.mode === 'both'
            ? `>= ${spend} AND >= ${orders}`
            : `>= ${spend} OR >= ${orders}`

    return {
      isOwner,
      isEditing,
      segmentRules,
      summaryLabel,
      onToggleEditing: () => setIsEditing((prev) => !prev),
      onSetSegmentRules: setSegmentRules,
    }
  }
