import type { FC } from 'react'
import { CustomerSegmentRulesSettings } from './CustomerSegmentRulesSettings'
import { useCustomerSegmentRulesSettingsController } from './CustomerSegmentRulesSettingsController'

export const CustomerSegmentRulesSettingsContainer: FC = () => {
  const viewModel = useCustomerSegmentRulesSettingsController()

  return <CustomerSegmentRulesSettings {...viewModel} />
}
