import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TimeSelectField } from './date-time-field'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('TimeSelectField', () => {
  it('keeps the picker open while scrolling and commits when it closes', async () => {
    const onChange = vi.fn()
    render(<TimeSelectField value="10:45" onChange={onChange} allowedSlots={['10:15', '10:30', '10:45', '11:00', '11:15']} />)

    fireEvent.click(screen.getByRole('button', { name: /10:45/i }))
    const listbox = screen.getByRole('listbox', { name: 'Time' })
    Object.defineProperty(listbox, 'scrollTop', { configurable: true, value: 120, writable: true })
    fireEvent.scroll(listbox)
    await wait(250)

    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onChange).toHaveBeenCalledWith('11:00')
  })

  it('commits immediately when a time is tapped and has no confirmation button', () => {
    const onChange = vi.fn()
    render(<TimeSelectField value="10:45" onChange={onChange} allowedSlots={['10:30', '10:45', '11:00']} />)

    fireEvent.click(screen.getByRole('button', { name: /10:45/i }))
    fireEvent.click(screen.getByRole('option', { name: '11:00' }))
    expect(onChange).toHaveBeenCalledWith('11:00')
    expect(screen.queryByRole('button', { name: /Use /i })).not.toBeInTheDocument()
  })
})

import { MonthPickerField } from './date-time-field'

describe('MonthPickerField', () => {
  it('shows a month-only grid and commits the selected month', () => {
    const onChange = vi.fn()
    render(<MonthPickerField value="2026-07" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /July 2026/i }))

    expect(screen.getByRole('button', { name: 'Jan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dec' })).toBeInTheDocument()
    expect(screen.queryByText('Su')).not.toBeInTheDocument()
    expect(screen.queryByText('Mo')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Jun' }))
    expect(onChange).toHaveBeenCalledWith('2026-06')
  })
})
