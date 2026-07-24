import type { FC } from 'react'
import {
  useOrderDetailsController,
  type UseOrderDetailsControllerParams,
} from './OrderDetailsController'
import { OrderDetailsPanel } from './OrderDetailsPanel'

export const OrderDetailsPanelController: FC<UseOrderDetailsControllerParams> = (
  props,
) => {
  const viewModel = useOrderDetailsController(props)

  return <OrderDetailsPanel {...viewModel} />
}
