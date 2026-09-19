import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCatalogProduct, makeVariant } from '../test/factories/catalogProduct'
import { useCatalogStore } from '../store/catalogStore'
import { StorefrontPage } from './Storefront'

const originalCatalogState = {
  products: useCatalogStore.getState().products,
  sizeGuideTemplates: useCatalogStore.getState().sizeGuideTemplates,
  sizeGuideTargets: useCatalogStore.getState().sizeGuideTargets,
}

const makeProducts = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const number = index + 1
    return makeCatalogProduct({
      id: `product_${number}`,
      productId: `BDY-${String(number).padStart(6, '0')}`,
      category: 'Birthday',
      name: `Product ${number}`,
      isFeatured: false,
      variants: [
        makeVariant({
          id: `variant_${number}`,
          sku: `BDY-FRE-TEST-${String(number).padStart(3, '0')}`,
          sizeOptionId: undefined,
        }),
      ],
    })
  })

describe('Storefront product discovery', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/shop')
    useCatalogStore.setState({
      products: makeProducts(60),
      sizeGuideTemplates: [],
      sizeGuideTargets: [],
    })
  })

  afterEach(() => {
    useCatalogStore.setState(originalCatalogState)
    vi.restoreAllMocks()
  })

  it('renders the product grid progressively instead of mounting the full catalog', async () => {
    const user = userEvent.setup()
    const { container } = render(<StorefrontPage />)
    const results = container.querySelector('.storefront-product-results')
    expect(results).not.toBeNull()

    expect(within(results as HTMLElement).getAllByRole('link', { name: /^View Product / })).toHaveLength(24)

    await user.click(screen.getByRole('button', { name: 'Load more products' }))

    expect(within(results as HTMLElement).getAllByRole('link', { name: /^View Product / })).toHaveLength(48)
  })

  it('stores and restores the revealed product count with shop history context', async () => {
    const user = userEvent.setup()
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { container } = render(<StorefrontPage />)
    const results = container.querySelector('.storefront-product-results') as HTMLElement

    await user.click(screen.getByRole('button', { name: 'Load more products' }))
    await user.click(within(results).getByRole('link', { name: 'View Product 30' }))

    const savedCall = [...replaceState.mock.calls]
      .reverse()
      .find(([state]) => state?.storefrontShop?.visibleProductCount === 48)
    expect(savedCall?.[0]?.storefrontShop).toEqual(expect.objectContaining({
      visibleProductCount: 48,
    }))

    const savedState = savedCall?.[0]
    window.history.replaceState(savedState, '', '/shop')
    window.dispatchEvent(new PopStateEvent('popstate', { state: savedState }))

    await waitFor(() => {
      expect(within(container.querySelector('.storefront-product-results') as HTMLElement)
        .getAllByRole('link', { name: /^View Product / })).toHaveLength(48)
    })
  })
})
