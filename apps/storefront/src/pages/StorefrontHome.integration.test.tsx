import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { StorefrontPage } from './Storefront'

describe('storefront homepage integration', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('removes the old homepage category footer and keeps one hero shop action', () => {
    const { container } = render(<StorefrontPage />)

    expect(container.querySelector('.storefront-home__categories')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open flower categories' })).toBeInTheDocument()
  })

  it('opens the categories page from the hero shop button', async () => {
    const user = userEvent.setup()
    render(<StorefrontPage />)

    await user.click(screen.getByRole('button', { name: 'Open flower categories' }))

    expect(window.location.pathname).toBe('/categories')
    expect(screen.getByRole('heading', { name: 'Categories' })).toBeInTheDocument()
  })

  it('keeps cart contents when returning from shop to homepage', async () => {
    const user = userEvent.setup()
    render(<StorefrontPage />)

    await user.click(screen.getByRole('button', { name: 'Open flower categories' }))
    await user.click(screen.getByRole('button', { name: /^Shop Birthday/ }))
    await user.click(screen.getAllByRole('button', { name: /^View / })[0])
    const addButtons = screen.getAllByRole('button', { name: 'Add to cart' })
    await user.click(addButtons[addButtons.length - 1])
    await user.click(screen.getAllByRole('button', { name: 'Open cart, 1 items' })[0])

    expect(screen.getByRole('heading', { name: 'Cart' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close cart' }))
    await user.click(screen.getByRole('button', { name: 'Back to shop' }))
    await user.click(
      await screen.findByRole('button', { name: 'Back to Fleurstales home' }),
    )

    expect(
      screen.getByRole('button', { name: 'Open cart, 1 items' }),
    ).toBeInTheDocument()
  })
})
