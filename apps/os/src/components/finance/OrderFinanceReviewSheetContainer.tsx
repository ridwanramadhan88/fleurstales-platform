import type { FC } from 'react'
import {
  OrderFinanceReviewSheet,
  type OrderFinanceReviewSheetProps,
} from './OrderFinanceReviewSheet'
import { useOrderFinanceReviewSheetController } from './OrderFinanceReviewSheetController'

export const OrderFinanceReviewSheetContainer: FC<OrderFinanceReviewSheetProps> = (
  props,
) => {
  const viewModel = useOrderFinanceReviewSheetController(props)

  return <OrderFinanceReviewSheet {...viewModel} />
}
