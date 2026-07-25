import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from '../store/catalogStore'
import { StorefrontPage } from './Storefront'

describe('storefront product detail page', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/shop')
    useCatalogStore.setState({
      sizeGuideTemplates: [],
      sizeGuideTargets: [],
    })
  })

  it('opens a dedicated product URL instead of a drawer', async () => {
    const user = userEvent.setup()
    render(<StorefrontPage />)

    await user.click(screen.getAllByRole('button', { name: 'View Petite Rainbow' })[0])

    expect(window.location.pathname).toMatch(/^\/shop\/product\//)
    expect(screen.getByRole('button', { name: 'Back to shop' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/Fresh flower|Artificial flower/).length).toBeGreaterThan(0)
  })

  it('only offers the assigned size guide and opens its image', async () => {
    const user = userEvent.setup()
    const product = useCatalogStore.getState().products[0]
    useCatalogStore.setState({
      sizeGuideTemplates: [{
        id: 'guide_test',
        name: 'Bouquet size guide',
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
    await user.click(screen.getByRole('button', { name: 'Size guide' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: `${product.name} size guide` })).toBeInTheDocument()
  })
})

it('shows a product-not-found state for an invalid direct product URL', () => {
  window.history.replaceState({}, '', '/shop/product/DOES-NOT-EXIST')
  render(<StorefrontPage />)

  expect(screen.getByRole('heading', { name: 'Product not found' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Back to shop' })).toBeInTheDocument()
})
