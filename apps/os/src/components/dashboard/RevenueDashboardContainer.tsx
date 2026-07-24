import type { FC } from 'react'
import { RevenueDashboard, type RevenueDashboardProps } from './RevenueDashboard'
import { useRevenueDashboardController } from './RevenueDashboardController'

export const RevenueDashboardContainer: FC<RevenueDashboardProps> = (props) => {
  const viewModel = useRevenueDashboardController(props)

  return <RevenueDashboard {...viewModel} />
}
