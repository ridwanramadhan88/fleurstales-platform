import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { useUserStore } from '../../store/userStore'
import { useCatalogStore } from '../../store/catalogStore'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { CatalogItemFormSheet } from './CatalogItemFormSheet'

const chart = {
  id: 'guide-bouquet', name: 'Bouquet Standard', imageUrl: '', byteSize: 0, width: 800, height: 800,
  createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z',
  sizes: [{ id: 'bouquet-standard-medium', name: 'Medium', sortOrder: 0, isActive: true }],
}

// Mirrors production products whose older size was never linked to the chart.
const legacyProduct = (): CatalogProduct => ({
  id: 'catalog_rosy_grande_096',
  productId: 'BDY-000096',
  category: 'Birthday',
  productType: 'Bouquet',
  material: 'fresh',
  name: 'Rosy Grande',
  isActive: true,
  images: [{ id: 'img-1', url: 'https://cdn.test/rosy.jpg', storagePath: 'catalog/rosy.jpg', sortOrder: 0, isPrimary: true }],
  variants: [{
    id: 'var-rosy-xl',
    sku: 'BDY-ROSY-XL',
    size: 'XL',
    price: 900000,
    status: 'active',
    images: [],
    flowerRecipe: [{ id: 'rose', flowerName: 'Mawar', quantity: 50, unit: 'stem' }],
  }],
})

const renderEditor = (product: CatalogProduct, onUpdate = vi.fn(async () => true)) => {
  render(
    <CatalogItemFormSheet
      open
      onClose={() => undefined}
      product={product}
      categoryOptions={['Birthday']}
      arrangementTypeOptions={['Bouquet']}
      onCreate={vi.fn()}
      onUpdate={onUpdate}
    />,
  )
  return onUpdate
}

describe('Editing an existing product', () => {
  beforeEach(() => {
    useUiLanguage.setState({ language: 'id' })
    useUserStore.getState().setRole('owner')
    useCatalogStore.setState({
      products: [legacyProduct()],
      sizeGuideTemplates: [chart],
      sizeGuideTargets: [{ id: 't-rosy', templateId: chart.id, scope: 'product', productId: 'catalog_rosy_grande_096' }],
    })
  })

  it('saves a name change even when an older size was never linked to the chart', async () => {
    const user = userEvent.setup()
    const onUpdate = renderEditor(legacyProduct())

    const name = screen.getByDisplayValue('Rosy Grande')
    await user.clear(name)
    await user.type(name, 'Rosy Grande Deluxe')
    await user.click(screen.getByRole('button', { name: 'Simpan perubahan' }))

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'catalog_rosy_grande_096', name: 'Rosy Grande Deluxe' }),
      { sizeTemplateId: 'guide-bouquet' },
    )
  })

  it('saves a name change for a product that has no size chart yet', async () => {
    useCatalogStore.setState({ sizeGuideTargets: [] })
    const user = userEvent.setup()
    const onUpdate = renderEditor(legacyProduct())

    const name = screen.getByDisplayValue('Rosy Grande')
    await user.clear(name)
    await user.type(name, 'Rosy')
    await user.click(screen.getByRole('button', { name: 'Simpan perubahan' }))

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Rosy' }), { sizeTemplateId: '' })
  })
})
