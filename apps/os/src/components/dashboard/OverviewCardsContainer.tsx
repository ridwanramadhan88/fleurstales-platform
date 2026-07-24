import type { FC } from 'react'
import { OverviewCards } from './OverviewCards'
import { useOverviewCardsController } from './OverviewCardsController'

export const OverviewCardsContainer: FC = () => {
  const viewModel = useOverviewCardsController()

  return <OverviewCards {...viewModel} />
}
