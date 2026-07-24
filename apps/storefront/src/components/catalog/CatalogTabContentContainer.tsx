import type { FC } from 'react'
import {
  CatalogTabContent,
  type CatalogTabContentProps,
} from './CatalogTabContent'
import { useCatalogTabContentController } from './CatalogTabContentController'

export const CatalogTabContentContainer: FC<CatalogTabContentProps> = (props) => {
  const viewModel = useCatalogTabContentController(props)

  return <CatalogTabContent {...viewModel} />
}
