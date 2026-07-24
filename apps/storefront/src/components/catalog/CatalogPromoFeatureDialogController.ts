import { useMemo, useState } from 'react'
import { useCatalogStore } from '../../store/catalogStore'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import type { CatalogPromoFeatureDialogProps } from './CatalogPromoFeatureDialog'

export interface CatalogPromoFeatureDialogViewModel
  extends CatalogPromoFeatureDialogProps {
  query: string
  activeProducts: CatalogProduct[]
  featuredCount: number
  promoCount: number
  onQueryChange: (value: string) => void
  getPromoPercent: (promoLabel: string | undefined) => string
  onToggleFeatured: (productId: string, isFeatured: boolean) => void
  onTogglePromo: (
    productId: string,
    enabled: boolean,
    currentPercent: string,
  ) => void
  onSetPromoPercent: (productId: string, percent: string) => void
}

const parsePromoPercent = (promoLabel: string | undefined): string => {
  if (!promoLabel) return ''
  const match = promoLabel.match(/(\d+(\.\d+)?)/)
  return match ? match[1] : ''
}

export const useCatalogPromoFeatureDialogController = ({
  open,
  onClose,
}: CatalogPromoFeatureDialogProps): CatalogPromoFeatureDialogViewModel => {
  const products = useCatalogStore((state) => state.products)
  const updateProduct = useCatalogStore((state) => state.updateProduct)
  const [query, setQuery] = useState('')

  const activeProducts = useMemo(
    () =>
      products
        .filter((product) => product.isActive)
        .filter((product) =>
          product.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products, query],
  )

  const featuredCount = products.filter(
    (product) => product.isActive && product.isFeatured,
  ).length
  const promoCount = products.filter(
    (product) => product.isActive && Boolean(product.promoLabel),
  ).length

  return {
    open,
    onClose,
    query,
    activeProducts,
    featuredCount,
    promoCount,
    onQueryChange: setQuery,
    getPromoPercent: parsePromoPercent,
    onToggleFeatured: (productId, isFeatured) => {
      updateProduct(productId, { isFeatured })
    },
    onTogglePromo: (productId, enabled, currentPercent) => {
      if (!enabled) {
        updateProduct(productId, { promoLabel: undefined })
        return
      }
      const percent = currentPercent.trim() || '10'
      updateProduct(productId, { promoLabel: `-${percent}%` })
    },
    onSetPromoPercent: (productId, percent) => {
      const trimmed = percent.trim()
      updateProduct(productId, { promoLabel: trimmed ? `-${trimmed}%` : undefined })
    },
  }
}
