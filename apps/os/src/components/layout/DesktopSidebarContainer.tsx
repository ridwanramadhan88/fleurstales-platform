import type { FC } from 'react'
import { DesktopSidebar, type DesktopSidebarProps } from './DesktopSidebar'
import { useDesktopSidebarController } from './DesktopSidebarController'

export const DesktopSidebarContainer: FC<DesktopSidebarProps> = (props) => {
  const viewModel = useDesktopSidebarController(props)

  return <DesktopSidebar {...viewModel} />
}
