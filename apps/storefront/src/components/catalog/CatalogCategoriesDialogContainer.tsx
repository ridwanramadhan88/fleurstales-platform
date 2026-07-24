import type { FC } from 'react'
import {
  CatalogCategoriesDialog,
  type CatalogCategoriesDialogProps,
} from './CatalogCategoriesDialog'
import { useCatalogCategoriesDialogController } from './CatalogCategoriesDialogController'

export const CatalogCategoriesDialogContainer: FC<
  CatalogCategoriesDialogProps
> = (props) => {
  const viewModel = useCatalogCategoriesDialogController(props)

  return <CatalogCategoriesDialog {...viewModel} />
}
