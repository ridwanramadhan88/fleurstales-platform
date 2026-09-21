import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogProduct } from '../store/catalogStoreTypes'
import { DEFAULT_OWNER_SETTINGS } from '../domain/settings/defaultOwnerSettings'
import { useCatalogStore } from '../store/catalogStore'
import { StorefrontProductDetailPage } from './StorefrontProductDetailPage'

const product: CatalogProduct = {
  id: 'test_bouquet',
  productId: 'BOQ-TEST-001',
  category: 'Bouquets',
  productType: 'Bouquet',
  material: 'fresh',
  name: 'Test Bouquet',
  description: 'A detailed bouquet description.',
  images: [{
    id: 'catalog-default',
    url: 'https://example.com/catalog.jpg',
    sortOrder: 0,
    isPrimary: true,
  }],
  variants: [
    {
      id: 'small',
      sku: 'SMALL',
      sizeOptionId: 'small-size',
      size: 'Small',
      price: 100_000,
      cost: 40_000,
      status: 'active',
      images: [{
        id: 'small-image',
        url: 'https://example.com/small.jpg',
        sortOrder: 0,
        isPrimary: true,
      }],
      flowerRecipe: [{ id: 'rose', flowerName: 'Red Rose', quantity: 10, unit: 'stem' }],
    },
    {
      id: 'large',
      sku: 'LARGE',
      sizeOptionId: 'large-size',
      size: 'Large',
      price: 175_000,
      status: 'active',
      images: [{
        id: 'large-image',
        url: 'https://example.com/large.jpg',
        sortOrder: 0,
        isPrimary: true,
      }],
      flowerRecipe: [{ id: 'rose-large', flowerName: 'Red Rose', quantity: 18, unit: 'stem' }],
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
  beforeEach(() => {
    useCatalogStore.setState({
      sizeGuideTemplates: [{
        id: 'guide-bouquet',
        name: 'Bouquet Standard',
        sizes: [
          { id: 'small-size', name: 'Small', guideImageUrl: 'https://example.com/small-chart.jpg', isActive: true },
          { id: 'large-size', name: 'Large', guideImageUrl: 'https://example.com/large-chart.jpg', isActive: true },
        ],
        imageUrl: '',
        byteSize: 0,
        width: 800,
        height: 800,
        createdAt: '2026-09-20T00:00:00.000Z',
        updatedAt: '2026-09-20T00:00:00.000Z',
      }],
      sizeGuideTargets: [{
        id: 'target-bouquet',
        templateId: 'guide-bouquet',
        scope: 'product',
        productId: product.id,
      }],
    })
  })

  it('opens on the Catalog default photo without preselecting a size', () => {
    renderPage()

    expect(screen.getByRole('img', { name: 'Test Bouquet — image 1' })).toHaveAttribute(
      'src',
      'https://example.com/catalog.jpg',
    )
    expect(screen.getByRole('button', { name: 'Small' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Large' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects a size, jumps to its photo, updates quantity and adds that variant', async () => {
    const user = userEvent.setup()
    const { onAddToCart, onOpenCart } = renderPage()

    await user.click(screen.getByRole('button', { name: 'Large' }))
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))

    expect(screen.getAllByText('Rp. 350.000').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Test Bouquet — image 3' })).toHaveAttribute(
      'src',
      'https://example.com/large.jpg',
    )

    const addButtons = screen.getAllByRole('button', { name: 'Add to cart' })
    await user.click(addButtons[addButtons.length - 1])

    expect(onAddToCart).toHaveBeenCalledWith('test_bouquet', 2, product.variants[1])
    expect(onOpenCart).not.toHaveBeenCalled()
  })

  it('changes size when the customer swipes from the Catalog photo to a variant photo', () => {
    renderPage()

    const catalogImage = screen.getByRole('img', { name: 'Test Bouquet — image 1' })
    const gallery = catalogImage.parentElement
    if (!gallery) throw new Error('Expected product gallery')

    fireEvent.touchStart(gallery, { touches: [{ clientX: 240 }] })
    fireEvent.touchEnd(gallery, { changedTouches: [{ clientX: 120 }] })

    expect(screen.getByRole('button', { name: 'Small' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Test Bouquet — image 2' })).toHaveAttribute(
      'src',
      'https://example.com/small.jpg',
    )
  })

  it('changes the selected size when navigating to a variant photo and keeps it when returning to Catalog default', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'View Large product image' }))
    expect(screen.getByRole('button', { name: 'Large' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('18 tangkai')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'View catalog default image' }))
    expect(screen.getByRole('button', { name: 'Large' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Test Bouquet — image 1' })).toHaveAttribute(
      'src',
      'https://example.com/catalog.jpg',
    )
  })

  it('auto-selects a single size but still opens on the Catalog default photo', () => {
    const singleSizeProduct: CatalogProduct = {
      ...product,
      id: 'single-size-product',
      productId: 'BOQ-SINGLE-001',
      variants: [product.variants[0]],
    }

    render(
      <StorefrontProductDetailPage
        product={singleSizeProduct}
        relatedProducts={[]}
        cartCount={0}
        cartTotalIdr={0}
        cartOpen={false}
        formatter={formatter}
        storeProfile={DEFAULT_OWNER_SETTINGS.storeProfile}
        onBack={vi.fn()}
        onOpenHome={vi.fn()}
        onOpenCart={vi.fn()}
        onOpenSearch={vi.fn()}
        onToggleMenu={vi.fn()}
        menuOpen={false}
        onOpenProduct={vi.fn()}
        onAddToCart={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Small' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Test Bouquet — image 1' })).toHaveAttribute(
      'src',
      'https://example.com/catalog.jpg',
    )
  })

  it('shows the flower recipe for the selected size variant', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Small' }))

    expect(screen.getByText('Resep Bunga')).toBeInTheDocument()
    expect(screen.getByText('Red Rose')).toBeInTheDocument()
    expect(screen.getByText('10 tangkai')).toBeInTheDocument()
  })

  it('shows Size Chart beside Description and follows the selected size', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByRole('tab', { name: 'Description' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Size Chart' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Small' }))
    await user.click(screen.getByRole('tab', { name: 'Size Chart' }))
    expect(screen.getByRole('img', { name: 'Test Bouquet Small size chart' })).toHaveAttribute(
      'src',
      'https://example.com/small-chart.jpg',
    )

    await user.click(screen.getByRole('button', { name: 'Large' }))
    expect(screen.getByRole('img', { name: 'Test Bouquet Large size chart' })).toHaveAttribute(
      'src',
      'https://example.com/large-chart.jpg',
    )
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
