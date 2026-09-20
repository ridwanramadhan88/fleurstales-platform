import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from '../store/catalogStore'
import { SEED_PRODUCTS } from '../store/catalogStoreSeedData'
import { StorefrontPage } from './Storefront'

describe('storefront product detail page', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/shop')
    useCatalogStore.setState({
      products: structuredClone(SEED_PRODUCTS),
      sizeGuideTemplates: [],
      sizeGuideTargets: [],
    })
  })

  it('opens a dedicated product URL instead of a drawer', async () => {
    const user = userEvent.setup()
    render(<StorefrontPage />)

    await user.click(screen.getAllByRole('link', { name: 'View Petite Rainbow' })[0])

    expect(window.location.pathname).toMatch(/^\/shop\/product\//)
    expect(screen.getByRole('button', { name: 'Back to shop' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/Fresh flower|Artificial flower/).length).toBeGreaterThan(0)
  })

  it('only offers the stable child size guide and opens its image', async () => {
    const user = userEvent.setup()
    const product = structuredClone(useCatalogStore.getState().products[0])
    const selectedVariant = product.variants.find((variant) => variant.status === 'active')
    if (!selectedVariant) throw new Error('Expected an active test variant')
    selectedVariant.sizeOptionId = 'guide-test-medium'

    useCatalogStore.setState({
      products: [product, ...useCatalogStore.getState().products.slice(1)],
      sizeGuideTemplates: [{
        id: 'guide_test',
        name: 'Bouquet size guide',
        sizes: [{
          id: 'guide-test-medium',
          name: selectedVariant.size,
          guideImageUrl: 'data:image/jpeg;base64,/9j/2Q==',
          isActive: true,
        }],
        imageUrl: '',
        byteSize: 0,
        width: 800,
        height: 800,
        createdAt: '2026-07-24T00:00:00.000Z',
        updatedAt: '2026-07-24T00:00:00.000Z',
      }],
      sizeGuideTargets: [{
        id: 'target_test',
        templateId: 'guide_test',
        scope: 'product',
        productId: product.id,
      }],
    })
    window.history.replaceState({}, '', `/shop/product/${product.productId}`)

    render(<StorefrontPage />)
    await user.click(screen.getByRole('button', { name: 'Size guide' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: `Bouquet size guide · ${selectedVariant.size}` })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: `${product.name} ${selectedVariant.size} size guide` })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    })
  })

  it('does not infer a Size Guide from a matching legacy size label', () => {
    const product = structuredClone(useCatalogStore.getState().products[0])
    const selectedVariant = product.variants.find((variant) => variant.status === 'active')
    if (!selectedVariant) throw new Error('Expected an active test variant')
    selectedVariant.sizeOptionId = undefined

    useCatalogStore.setState({
      products: [product, ...useCatalogStore.getState().products.slice(1)],
      sizeGuideTemplates: [{
        id: 'guide_test',
        name: 'Bouquet size guide',
        sizes: [{
          id: 'different-stable-id',
          name: selectedVariant.size,
          guideImageUrl: 'data:image/jpeg;base64,/9j/2Q==',
          isActive: true,
        }],
        imageUrl: 'data:image/jpeg;base64,/9j/2Q==',
        byteSize: 7,
        width: 800,
        height: 800,
        createdAt: '2026-07-24T00:00:00.000Z',
        updatedAt: '2026-07-24T00:00:00.000Z',
      }],
      sizeGuideTargets: [{
        id: 'target_test',
        templateId: 'guide_test',
        scope: 'product',
        productId: product.id,
      }],
    })
    window.history.replaceState({}, '', `/shop/product/${product.productId}`)

    render(<StorefrontPage />)

    expect(screen.queryByRole('button', { name: 'Size guide' })).not.toBeInTheDocument()
  })

  it('removes a needs-review linked product from Storefront while keeping the legacy Catalog row intact', () => {
    const products = structuredClone(useCatalogStore.getState().products)
    const product = products[0]
    const selectedVariant = product.variants.find((variant) => variant.status === 'active')
    if (!selectedVariant) throw new Error('Expected an active test variant')
    selectedVariant.sizeOptionId = 'old-child'

    useCatalogStore.setState({
      products,
      sizeGuideTemplates: [{
        id: 'guide_changed',
        name: 'Changed guide',
        sizes: [{ id: 'new-child', name: selectedVariant.size, isActive: true }],
        imageUrl: '',
        byteSize: 0,
        width: 800,
        height: 800,
        createdAt: '2026-07-24T00:00:00.000Z',
        updatedAt: '2026-07-24T00:00:00.000Z',
      }],
      sizeGuideTargets: [{
        id: 'target_changed',
        templateId: 'guide_changed',
        scope: 'product',
        productId: product.id,
      }],
    })
    window.history.replaceState({}, '', `/shop/product/${product.productId}`)

    render(<StorefrontPage />)

    expect(screen.getByRole('heading', { name: 'Product not found' })).toBeInTheDocument()
    expect(useCatalogStore.getState().products[0].variants[0].sizeOptionId).toBe('old-child')
  })
})

it('shows a product-not-found state for an invalid direct product URL', () => {
  window.history.replaceState({}, '', '/shop/product/DOES-NOT-EXIST')
  render(<StorefrontPage />)

  expect(screen.getByRole('heading', { name: 'Product not found' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Back to shop' })).toBeInTheDocument()
})
