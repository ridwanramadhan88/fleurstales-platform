import type { FC } from 'react'
import { useUserStore } from '../../store/userStore'
import { installHrManagedEmployeeAccessMutation } from '../../store/hrManagedEmployeeAccessMutation'
import { HrTabContent, type HrTabContentProps } from './HrTabContent'
import { useHrTabContentController } from './HrTabContentController'

installHrManagedEmployeeAccessMutation()

export const HrTabContentContainer: FC<HrTabContentProps> = (props) => {
  const role = useUserStore((state) => state.role)
  const viewModel = useHrTabContentController(props)
  const canEditCredentials = viewModel.canEditCredentials || (role === 'hr' && viewModel.canManageEmployeeDetails)

  return <HrTabContent {...viewModel} canEditCredentials={canEditCredentials} />
}
