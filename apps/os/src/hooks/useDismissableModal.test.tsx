import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useDismissableModal } from './useDismissableModal'

const Sheet = ({ onClose, menuOpen }: { onClose: () => void; menuOpen: boolean }) => {
  useDismissableModal(true, onClose)
  return menuOpen ? <div data-radix-popper-content-wrapper=""><div role="menu">menu</div></div> : null
}

describe('useDismissableModal', () => {
  it('closes the sheet on Escape', () => {
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} menuOpen={false} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('leaves the sheet open when Escape closes a menu on top of it', () => {
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} menuOpen />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
