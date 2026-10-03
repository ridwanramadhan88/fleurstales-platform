import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PermissionMatrixPanel } from './PermissionMatrixPanel'
import { DEFAULT_ACTION_PERMISSIONS } from '../../config/actionPermissions'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../../config/permissions'

const renderPanel = (overrides: { isEditing?: boolean } = {}) => {
  const permissions = structuredClone(DEFAULT_ROLE_SECTION_ACCESS)
  const actionPermissions = structuredClone(DEFAULT_ACTION_PERMISSIONS)
  permissions.admin.customers = 'none'
  actionPermissions.admin['orders.assign'] = false
  const onUpdateAccess = vi.fn()
  const onUpdateActionAccess = vi.fn()
  render(
    <PermissionMatrixPanel
      isEditing={overrides.isEditing ?? true}
      permissions={permissions}
      actionPermissions={actionPermissions}
      roleEmployeeCounts={{ owner: 1, admin: 2, finance: 1, hr: 1, florist: 3 }}
      roles={['admin', 'owner']}
      onUpdateAccess={onUpdateAccess}
      onUpdateActionAccess={onUpdateActionAccess}
      validationErrors={{}}
    />,
  )
  return { onUpdateAccess, onUpdateActionAccess }
}

describe('access settings start from role presets (UX plan PR 7)', () => {
  it('shows only the changes from the preset', () => {
    renderPanel()
    expect(screen.getByText('2 changes from the preset')).toBeInTheDocument()
    const changes = within(screen.getByRole('list', { name: 'Changes from the preset' })).getAllByRole('listitem')
    expect(changes).toHaveLength(2)
    expect(changes[0].firstChild?.textContent).toBe('Customers')
  })

  it('"Restore preset" puts the role back through the normal edit callbacks', () => {
    const { onUpdateAccess, onUpdateActionAccess } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Restore preset' }))
    expect(onUpdateAccess).toHaveBeenCalledWith('admin', 'customers', 'edit')
    expect(onUpdateActionAccess).toHaveBeenCalledWith('admin', 'orders.assign', true)
  })

  it('offers no restore while only viewing', () => {
    renderPanel({ isEditing: false })
    expect(screen.queryByRole('button', { name: 'Restore preset' })).not.toBeInTheDocument()
  })
})
