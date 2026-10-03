import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { filterSearchableOptions, SearchableSelect } from './searchable-select'

const options = [
  { id: 'p1', label: 'Petite Rainbow · Rp 189.000' },
  { id: 'p2', label: 'Pink Lily · Rp 121.000' },
  { id: 'p3', label: 'Peony Coquette · Rp 294.000' },
  { id: 'p4', label: 'Rose Crêpe · Rp 425.000' },
]

describe('filterSearchableOptions', () => {
  it('matches every word, ignoring case and accents', () => {
    expect(filterSearchableOptions(options, 'pink').map((o) => o.id)).toEqual(['p2'])
    expect(filterSearchableOptions(options, 'rose crepe').map((o) => o.id)).toEqual(['p4'])
    expect(filterSearchableOptions(options, 'pe 294').map((o) => o.id)).toEqual(['p3'])
    expect(filterSearchableOptions(options, '  ')).toHaveLength(4)
  })
})

describe('SearchableSelect', () => {
  it('filters as you type and picks with Enter', () => {
    const onValueChange = vi.fn()
    render(<SearchableSelect id="product" value="" options={options} onValueChange={onValueChange} placeholder="Select product" searchPlaceholder="Search product" emptyLabel="No product matches." />)

    fireEvent.click(screen.getByRole('combobox'))
    const search = screen.getByRole('searchbox', { name: 'Search product' })
    fireEvent.change(search, { target: { value: 'lily' } })
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Pink Lily · Rp 121.000'])

    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onValueChange).toHaveBeenCalledWith('p2')
  })

  it('says so when nothing matches', () => {
    render(<SearchableSelect value="" options={options} onValueChange={vi.fn()} placeholder="Select product" searchPlaceholder="Search product" emptyLabel="No product matches." />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tulip' } })
    expect(screen.getByText('No product matches.')).toBeInTheDocument()
  })
})
