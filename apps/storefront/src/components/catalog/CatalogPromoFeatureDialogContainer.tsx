import type { FC } from 'react'
import {
  CatalogPromoFeatureDialog,
  type CatalogPromoFeatureDialogProps,
} from './CatalogPromoFeatureDialog'
import { useCatalogPromoFeatureDialogController } from './CatalogPromoFeatureDialogController'

export const CatalogPromoFeatureDialogContainer: FC<
  CatalogPromoFeatureDialogProps
> = (props) => {
  const viewModel = useCatalogPromoFeatureDialogController(props)

  return <CatalogPromoFeatureDialog {...viewModel} />
}
