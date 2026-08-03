import type { FC } from 'react'
import {
  OrderVerificationQueue,
  type OrderVerificationQueueProps,
} from './OrderVerificationQueue'
import { useOrderVerificationQueueController } from './OrderVerificationQueueController'

export const OrderVerificationQueueContainer: FC<
  OrderVerificationQueueProps
> = (props) => {
  const viewModel = useOrderVerificationQueueController(props)

  return <OrderVerificationQueue {...viewModel} />
}
