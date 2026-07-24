import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BranchSettingsPanel } from './BranchSettingsPanel'
import type { BranchSettings } from '../../types/settings'

const branch: BranchSettings = {
  id: 'branch-test',
  name: 'Test Branch',
  code: 'TST',
  address: 'Test address',
  phone: '0800000000',
  isActive: true,
  openingHours: {
    monday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
    tuesday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
    wednesday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
    thursday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
    friday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
    saturday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
    sunday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
  },
}

describe('BranchSettingsPanel opening-hours editor', () => {
  it('defaults matching schedules to the shared all-days mode', () => {
    render(
      <BranchSettingsPanel
        isEditing
        branches={[branch]}
        onAddBranch={vi.fn()}
        onUpdateBranch={vi.fn()}
        onSetBranchActive={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))

    expect(screen.getByRole('button', { name: 'Same every day' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('switch', { name: 'Open all days' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Monday open' })).not.toBeInTheDocument()
  })

  it('supports switching to individual-day controls', () => {
    render(
      <BranchSettingsPanel
        isEditing
        branches={[branch]}
        onAddBranch={vi.fn()}
        onUpdateBranch={vi.fn()}
        onSetBranchActive={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Customize days' }))

    expect(screen.getByRole('button', { name: 'Customize days' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('switch', { name: 'Monday open' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Sunday open' })).toBeInTheDocument()
  })

  it('normalizes an individual schedule to Monday hours when returning to shared mode', () => {
    const onUpdateBranch = vi.fn()
    const customBranch: BranchSettings = {
      ...branch,
      openingHours: {
        ...branch.openingHours!,
        sunday: { isOpen: false, opensAt: '09:00', closesAt: '18:00' },
      },
    }

    render(
      <BranchSettingsPanel
        isEditing
        branches={[customBranch]}
        onAddBranch={vi.fn()}
        onUpdateBranch={onUpdateBranch}
        onSetBranchActive={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    expect(screen.getByRole('button', { name: 'Customize days' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Same every day' }))

    expect(onUpdateBranch).toHaveBeenCalledWith(
      'branch-test',
      expect.objectContaining({
        openingHours: expect.objectContaining({
          monday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
          sunday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
        }),
      }),
    )
  })
})
