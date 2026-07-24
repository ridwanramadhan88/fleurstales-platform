import type { FC } from 'react'
import {
  CustomersTabContent,
  type CustomersTabContentProps,
} from './CustomersTabContent'
import { useCustomersTabContentController } from './CustomersTabContentController'

export const CustomersTabContentContainer: FC<CustomersTabContentProps> = (
  props,
) => {
  const viewModel = useCustomersTabContentController(props)

  return <CustomersTabContent {...viewModel} />
}
