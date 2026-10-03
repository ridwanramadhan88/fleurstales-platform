import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { useUserStore } from '../../store/userStore'
import type { CatalogSizeGuideTemplate } from '../../store/catalogStoreTypes'
import { CatalogVariantEditorDialog } from './CatalogVariantEditorDialog'
import type { VariantRow } from './CatalogItemFormSheet'

const chart: CatalogSizeGuideTemplate = {
  id: 'guide-bouquet',
  name: 'Bouquet Standard',
  sizes: [{ id: 'small', name: 'Small', sortOrder: 0, isActive: true }],
  imageUrl: '',
  byteSize: 0,
  width: 800,
  height: 800,
  createdAt: '2026-10-03T00:00:00.000Z',
  updatedAt: '2026-10-03T00:00:00.000Z',
}

const newSmall = (): VariantRow => ({
  sizeOptionId: 'small',
  size: 'Small',
  images: [],
  price: '',
  cost: '',
  status: 'active',
  flowerRecipe: [],
})

const renderEditor = (onApply = vi.fn()) => {
  render(
    <CatalogVariantEditorDialog
      open
      onOpenChange={() => undefined}
      variant={newSmall()}
      variantLabel="Atur varian · Small"
      sizeTemplate={chart}
      reservedSizeOptionIds={new Set()}
      onApply={onApply}
    />,
  )
  return onApply
}

describe('Variant editor linear steps', () => {
  beforeEach(() => {
    useUiLanguage.setState({ language: 'id' })
    useUserStore.getState().setRole('owner')
  })

  it('walks Detail -> Foto (optional, skippable) -> Resep and only saves on the last step', async () => {
    const user = userEvent.setup()
    const onApply = renderEditor()

    // Step 1 blocks until the price is valid.
    await user.click(screen.getByRole('button', { name: 'Lanjut' }))
    expect(screen.getByText('Harga jual harus lebih dari Rp0.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Simpan ukuran/ })).toBeNull()

    await user.type(screen.getByPlaceholderText('Rp0'), '150000')
    await user.click(screen.getByRole('button', { name: 'Lanjut' }))

    // Step 2: the photo is optional, so the primary action reads "Lewati".
    expect(screen.getByText(/Opsional\. Setiap ukuran dapat memiliki maksimal 1 foto/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lewati' }))

    // Step 3: saving needs at least one recipe item.
    await user.click(screen.getByRole('button', { name: /Simpan ukuran/ }))
    expect(screen.getByText('Varian aktif wajib memiliki minimal 1 item Resep Bunga.')).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Tambah bunga' }))
    await user.type(screen.getByPlaceholderText('Contoh: Mawar Merah'), 'Mawar')
    await user.click(screen.getByRole('button', { name: /Simpan ukuran/ }))

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      sizeOptionId: 'small',
      price: '150000',
      images: [],
      flowerRecipe: [expect.objectContaining({ flowerName: 'Mawar' })],
    }))
  })

  it('goes back a step with Kembali and does not let a new size jump ahead', async () => {
    const user = userEvent.setup()
    renderEditor()

    expect(screen.getByRole('button', { name: /Resep/ })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Rp0'), '90000')
    await user.click(screen.getByRole('button', { name: 'Lanjut' }))
    await user.click(screen.getByRole('button', { name: 'Kembali' }))
    expect(screen.getByPlaceholderText('Rp0')).toHaveValue(90000)
  })
})
