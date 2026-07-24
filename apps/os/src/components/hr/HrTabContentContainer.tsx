import type { FC } from 'react'
import { HrTabContent, type HrTabContentProps } from './HrTabContent'
import { useHrTabContentController } from './HrTabContentController'

export const HrTabContentContainer: FC<HrTabContentProps> = (props) => {
  const viewModel = useHrTabContentController(props)

  return <HrTabContent {...viewModel} />
}
