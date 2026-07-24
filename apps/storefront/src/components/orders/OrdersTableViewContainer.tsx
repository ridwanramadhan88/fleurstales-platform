import type { FC } from 'react'
import {
  OrdersTableView,
  type OrdersTableViewProps,
} from './OrdersTableView'
import { useOrdersTableViewController } from './OrdersTableViewController'

export const OrdersTableViewContainer: FC<OrdersTableViewProps> = (props) => {
  const viewModel = useOrdersTableViewController(props)

  return <OrdersTableView {...viewModel} />
}
