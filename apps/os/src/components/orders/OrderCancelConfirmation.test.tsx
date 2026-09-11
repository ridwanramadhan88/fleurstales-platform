import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent } from '../ui/dialog'
import { ConfirmActionDialog } from '../ui/confirm-action-dialog'
import { useOrderDetailsActions } from './useOrderDetailsActions'
import { makeOrder } from '../../test/factories/order'
import type { OrderTableRow } from '../../types/orders'
import type { UpdateOrderStatusInput, UpdateOrderStatusResult } from '../../store/ordersStoreTypes'

/**
 * Regression test for the dead "Batalkan pesanan" confirmation.
 *
 * Root cause: the old flow called the imperative requestAppConfirmation()
 * helper, which appends a manual div to document.body. Inside an open Radix
 * Dialog (the order sheet) the body carries pointer-events: none, so the
 * manual overlay paints on top (z-200) but never receives clicks.
 *
 * The fixed flow drives a declarative Radix AlertDialog from hook state, so
 * Radix manages the modal stack and the confirm button stays clickable.
 * This test renders the trigger inside an OPEN Radix Dialog (mimicking the
 * order sheet): with the old implementation the confirm click cannot land
 * and no imperative overlay assertion below would hold.
 */
const Harness = ({
  order,
  updateOrderStatus,
}: {
  order: OrderTableRow
  updateOrderStatus: (input: UpdateOrderStatusInput) => UpdateOrderStatusResult
}) => {
  const actions = useOrderDetailsActions({
    order,
    canAdvance: true,
    nextStatus: 'processing',
    updateOrderStatus,
    addActivity: vi.fn(),
    actor: { employeeId: 'admin-1', name: 'Admin Sari', role: 'admin', branchId: 'Kedamaian' },
  })
  return (
    <Dialog open>
      <DialogContent>
        <button type="button" data-testid="cancel-trigger" onClick={actions.onCancelOrder}>
          Cancel order (menu)
        </button>
        <ConfirmActionDialog
          open={actions.cancelConfirmOpen}
          onOpenChange={actions.onCancelConfirmChange}
          title="Cancel this order?"
          description={`Cancel order for ${order.customerName}? This can be undone from the toast immediately after.`}
          confirmLabel="Cancel order"
          destructive
          onConfirm={actions.confirmCancelOrder}
        />
      </DialogContent>
    </Dialog>
  )
}

const renderHarness = (order = makeOrder({ status: 'confirmed' })) => {
  const updateOrderStatus = vi.fn(
    (input: UpdateOrderStatusInput): UpdateOrderStatusResult => ({
      allowed: true,
      order: { ...order, status: input.status },
      previousStatus: order.status,
      nextStatus: input.status,
    }),
  )
  render(<Harness order={order} updateOrderStatus={updateOrderStatus} />)
  return { updateOrderStatus }
}

describe('order cancel confirmation layering', () => {
  it('opens a Radix confirmation (not a body-appended div) and cancels on confirm', async () => {
    const user = userEvent.setup()
    const { updateOrderStatus } = renderHarness()

    await user.click(screen.getByTestId('cancel-trigger'))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    // The legacy imperative helper mounted a manual div directly on the
    // body; its absence proves the declarative Radix path is used.
    expect(document.body.querySelector('.z-\\[200\\]')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))

    await waitFor(() => {
      expect(updateOrderStatus).toHaveBeenCalledTimes(1)
    })
    expect(updateOrderStatus.mock.calls[0][0]).toMatchObject({ status: 'cancelled' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('does nothing when the confirmation is dismissed', async () => {
    const user = userEvent.setup()
    const { updateOrderStatus } = renderHarness()

    await user.click(screen.getByTestId('cancel-trigger'))
    await screen.findByRole('alertdialog')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(updateOrderStatus).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
