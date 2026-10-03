import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { useUserStore } from '../../store/userStore'
import { useCatalogStore } from '../../store/catalogStore'
import { CatalogSizeGuideDialog } from './CatalogSizeGuideDialog'

describe('Template ukuran manager', () => {
  beforeEach(() => {
    useUiLanguage.setState({ language: 'id' })
    useUserStore.getState().setRole('owner')
    useCatalogStore.setState({
      products: [],
      sizeGuideTargets: [],
      sizeGuideTemplates: [
        {
          id: 'guide-box', name: 'Bloom Box', imageUrl: '', byteSize: 0, width: 800, height: 800,
          createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z',
          sizes: [
            { id: 'box-small', name: 'Small', sortOrder: 0, isActive: true },
            { id: 'box-large', name: 'Large', sortOrder: 1, isActive: true },
          ],
        },
      ],
    })
  })

  it('lists templates first, opens one, and keeps each size collapsed until tapped', async () => {
    const user = userEvent.setup()
    render(<CatalogSizeGuideDialog open onClose={() => undefined} />)

    await user.click(screen.getByRole('button', { name: /Bloom Box/ }))
    const small = screen.getByRole('button', { name: /^Small/ })
    expect(small).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByDisplayValue('Small')).toBeNull()

    await user.click(small)
    expect(small).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByDisplayValue('Small')).toBeInTheDocument()

    // Opening another size closes the first one.
    await user.click(screen.getByRole('button', { name: /^Large/ }))
    expect(screen.queryByDisplayValue('Small')).toBeNull()
    expect(screen.getByDisplayValue('Large')).toBeInTheDocument()
  })

  it('creates a new template from the list and opens it', async () => {
    const user = userEvent.setup()
    render(<CatalogSizeGuideDialog open onClose={() => undefined} />)

    await user.click(screen.getByRole('button', { name: /Buat template baru/ }))
    await user.type(screen.getByLabelText('Nama template baru'), 'Vase')
    await user.click(screen.getByRole('button', { name: 'Buat' }))

    expect(screen.getByDisplayValue('Vase')).toBeInTheDocument()
    expect(screen.getByText('Belum ada ukuran. Tambahkan ukuran pertama di bawah.')).toBeInTheDocument()
  })
})
