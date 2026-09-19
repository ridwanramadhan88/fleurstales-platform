import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeCatalogProduct } from '../../test/factories/catalogProduct'
import { StorefrontProductCard } from './StorefrontProductCard'

const formatter = new Intl.NumberFormat('id-ID')

describe('StorefrontProductCard', () => {
  it('uses one semantic product link for image and product information', async () => {
    const user = userEvent.setup()
    const onOpenDetail = vi.fn()

    render(
      <StorefrontProductCard
        product={makeCatalogProduct()}
        formatter={formatter}
        onOpenDetail={onOpenDetail}
      />,
    )

    const link = screen.getByRole('link', { name: 'View Rose Bouquet' })
    expect(link).toHaveAttribute('href', '/shop/product/BOQ-000001')
    expect(screen.queryAllByRole('button')).toHaveLength(0)

    await user.click(link)
    expect(onOpenDetail).toHaveBeenCalledOnce()
  })

  it('keeps cloned rail cards out of the keyboard and accessibility trees', () => {
    const { container } = render(
      <StorefrontProductCard
        product={makeCatalogProduct()}
        formatter={formatter}
        onOpenDetail={vi.fn()}
        tabIndex={-1}
        ariaHidden
      />,
    )

    const link = container.querySelector('a')
    expect(link).toHaveAttribute('tabindex', '-1')
    expect(link).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('link', { name: 'View Rose Bouquet' })).not.toBeInTheDocument()
  })
})
