import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CatalogProduct } from '../store/catalogStoreTypes'
import { DEFAULT_OWNER_SETTINGS } from '../domain/settings/defaultOwnerSettings'
import { StorefrontProductDetailPage } from './StorefrontProductDetailPage'

const product: CatalogProduct = {
  id: 'test_bouquet',
  productId: 'BOQ-TEST-001',
  category: 'Bouquets',
  material: 'fresh',
  name: 'Test Bouquet',
  description: 'A detailed bouquet description.',
  variants: [
    {
      id: 'small',
      sku: 'SMALL',
      size: 'Small',
      price: 100_000,
      cost: 40_000,
      status: 'active',
      flowerRecipe: [{ id: 'rose', flowerName: 'Red Rose', quantity: 10, unit: 'stem' }],
    },
    {
      id: 'large',
      sku: 'LARGE',
      size: 'Large',
      price: 175_000,
      status: 'active',
      images: [{
        id: 'large-image',
        url: 'https://example.com/large.jpg',
        sortOrder: 0,
        isPrimary: true,
      }],
    },
    { id: 'retired', sku: 'OLD', size: 'Retired', price: 80_000, status: 'inactive' },
  ],
  isActive: true,
  isCustomizable: true,
}

const formatter = new Intl.NumberFormat('id-ID')

const renderPage = (onAddToCart = vi.fn(), onOpenCart = vi.fn()) => {
  render(
    <StorefrontProductDetailPage
      product={product}
      relatedProducts={[]}
      cartCount={0}
      cartTotalIdr={0}
      cartOpen={false}
      formatter={formatter}
      storeProfile={DEFAULT_OWNER_SETTINGS.storeProfile}
      onBack={vi.fn()}
      onOpenHome={vi.fn()}
      onOpenCart={onOpenCart}
      onOpenSearch={vi.fn()}
      onToggleMenu={vi.fn()}
      menuOpen={false}
      onOpenProduct={vi.fn()}
      onAddToCart={onAddToCart}
    />,
  )
  return { onAddToCart, onOpenCart }
}

describe('StorefrontProductDetailPage purchase behavior', () => {
  it('selects a size, updates quantity and adds the selected variant', async () => {
    const user = userEvent.setup()
    const { onAddToCart, onOpenCart } = renderPage()

    await user.click(screen.getByRole('button', { name: 'Large' }))
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))

    expect(screen.getAllByText('Rp. 350.000').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Test Bouquet — image 1' })).toHaveAttribute(
      'src',
      'https://example.com/large.jpg',
    )

    const addButtons = screen.getAllByRole('button', { name: 'Add to cart' })
    await user.click(addButtons[addButtons.length - 1])

    expect(onAddToCart).toHaveBeenCalledWith('test_bouquet', 2, product.variants[1])
    expect(onOpenCart).not.toHaveBeenCalled()
  })

  it('shows the flower recipe for the selected size variant', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Small' }))

    expect(screen.getByText('Resep Bunga')).toBeInTheDocument()
    expect(screen.getByText('Red Rose')).toBeInTheDocument()
    expect(screen.getByText('10 tangkai')).toBeInTheDocument()
  })

  it('shows description, material and customer-facing details without exposing SKU', () => {
    renderPage()

    expect(screen.getByText('A detailed bouquet description.')).toBeInTheDocument()
    expect(screen.getAllByText('Fresh flower').length).toBeGreaterThan(0)
    expect(screen.getByText('BOQ-TEST-001')).toBeInTheDocument()
    expect(screen.queryByText('SMALL')).not.toBeInTheDocument()
    expect(screen.queryByText('Red Rose')).not.toBeInTheDocument()
    expect(screen.getByText('Resep Bunga')).toBeInTheDocument()
    expect(screen.getByText('Pilih ukuran untuk melihat Resep Bunga.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retired' })).toBeDisabled()
  })
})
