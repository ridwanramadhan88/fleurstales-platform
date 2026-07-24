import type { FC } from 'react'
import { TopBar, type TopBarProps } from './TopBar'
import { useTopBarController } from './TopBarController'

export const TopBarContainer: FC<TopBarProps> = (props) => {
  const viewModel = useTopBarController(props)

  return <TopBar {...viewModel} />
}
