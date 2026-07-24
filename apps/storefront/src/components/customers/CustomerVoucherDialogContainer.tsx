import type { FC } from 'react'
import {
  CustomerVoucherDialog,
  type CustomerVoucherDialogProps,
} from './CustomerVoucherDialog'
import { useCustomerVoucherDialogController } from './CustomerVoucherDialogController'

export const CustomerVoucherDialogContainer: FC<CustomerVoucherDialogProps> = (
  props,
) => {
  const viewModel = useCustomerVoucherDialogController(props)

  return <CustomerVoucherDialog {...viewModel} />
}
