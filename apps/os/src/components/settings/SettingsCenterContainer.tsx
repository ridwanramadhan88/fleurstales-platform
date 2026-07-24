import type { FC } from 'react'
import { SettingsCenter } from './SettingsCenter'
import { useSettingsCenterController } from './SettingsCenterController'

export const SettingsCenterContainer: FC = () => {
  const viewModel = useSettingsCenterController()

  return <SettingsCenter {...viewModel} />
}
