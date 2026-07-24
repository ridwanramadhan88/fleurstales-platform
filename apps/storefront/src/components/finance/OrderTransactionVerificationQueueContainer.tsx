import type { FC } from 'react'
import {
  OrderTransactionVerificationQueue,
  type OrderTransactionVerificationQueueProps,
} from './OrderTransactionVerificationQueue'
import { useOrderTransactionVerificationQueueController } from './OrderTransactionVerificationQueueController'

export const OrderTransactionVerificationQueueContainer: FC<
  OrderTransactionVerificationQueueProps
> = (props) => {
  const viewModel = useOrderTransactionVerificationQueueController(props)

  return <OrderTransactionVerificationQueue {...viewModel} />
}
