import { describe, expect, it } from 'vitest'
import { canViewPaymentProof } from './OrderPaymentProofButton'

const withProof = { paymentMethod: 'transfer' as const, paymentProofUrl: 'order_1/proof-1.jpg' }

describe('canViewPaymentProof', () => {
  it.each(['owner', 'admin', 'finance'])('lets %s open a transfer proof', (role) => {
    expect(canViewPaymentProof(role, withProof)).toBe(true)
  })

  it.each(['florist', 'hr'])('hides the proof from %s (Storage denies them too)', (role) => {
    expect(canViewPaymentProof(role, withProof)).toBe(false)
  })

  it('needs a transfer order with an attached proof', () => {
    expect(canViewPaymentProof('admin', { paymentMethod: 'transfer', paymentProofUrl: undefined })).toBe(false)
    expect(canViewPaymentProof('admin', { paymentMethod: 'cash', paymentProofUrl: 'x.jpg' })).toBe(false)
  })
})
