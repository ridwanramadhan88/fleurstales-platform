import type { FC } from 'react'
import { BottomTabBar, type BottomTabBarProps } from './BottomTabBar'
import { useBottomTabBarController } from './BottomTabBarController'

export const BottomTabBarContainer: FC<BottomTabBarProps> = (props) => {
  const viewModel = useBottomTabBarController(props)

  return <BottomTabBar {...viewModel} />
}
