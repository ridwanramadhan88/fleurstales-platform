import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StorefrontFlowerRecipe } from './StorefrontFlowerRecipe'

describe('StorefrontFlowerRecipe', () => {
  it('shows the selected variant recipe with the Resep Bunga label', () => {
    render(
      <StorefrontFlowerRecipe
        variant={{
          id: 'var-medium',
          sku: 'BOQ-FRE-RED-MED-001',
          size: 'Medium',
          price: 500000,
          status: 'active',
          flowerRecipe: [
            { id: 'rose', flowerName: 'Red Rose', quantity: 12, unit: 'stem' },
            { id: 'baby', flowerName: "Baby's Breath", quantity: 3, unit: 'stem' },
          ],
        }}
      />,
    )

    expect(screen.getByText('Resep Bunga')).toBeInTheDocument()
    expect(screen.getByText('Medium')).toBeInTheDocument()
    expect(screen.getByText('Red Rose')).toBeInTheDocument()
    expect(screen.getByText('12 tangkai')).toBeInTheDocument()
    expect(screen.getByText("Baby's Breath")).toBeInTheDocument()
  })

  it('asks for a size before showing a multi-size recipe', () => {
    render(<StorefrontFlowerRecipe showSelectionHint />)
    expect(screen.getByText('Pilih ukuran untuk melihat Resep Bunga.')).toBeInTheDocument()
  })
})
