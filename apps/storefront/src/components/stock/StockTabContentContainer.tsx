import type { FC } from 'react'
import {
  StockTabContent,
  type StockTabContentProps,
} from './StockTabContent'
import { useStockTabContentController } from './StockTabContentController'

export const StockTabContentContainer: FC<StockTabContentProps> = (props) => {
  const viewModel = useStockTabContentController(props)

  return <StockTabContent {...viewModel} />
}
