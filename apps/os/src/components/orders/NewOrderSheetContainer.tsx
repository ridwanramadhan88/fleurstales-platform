import type { FC } from 'react'
import { NewOrderSheet, type NewOrderSheetProps } from './NewOrderSheet'
import { useNewOrderSheetController } from './NewOrderSheetController'

export const NewOrderSheetContainer: FC<NewOrderSheetProps> = (props) => {
  const viewModel = useNewOrderSheetController(props)

  return <NewOrderSheet {...viewModel} />
}
