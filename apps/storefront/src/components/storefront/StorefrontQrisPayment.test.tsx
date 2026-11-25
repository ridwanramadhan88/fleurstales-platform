import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StorefrontQrisPayment } from './StorefrontQrisPayment'

// Synthetic dynamic QRIS (same as supabase/tests/branch_qris_smoke.sql).
const payment = {
  payload: '00020101021226650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI520459925303360540410005802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A0163042BF5',
  amountIdr: 329007,
  billIdr: 330000,
  uniqueDiscountIdr: 993,
  nmid: 'ID1000000000001',
  branchName: 'Kedamaian',
  amountUpdated: false,
}

describe('StorefrontQrisPayment', () => {
  it('shows the order QR, the exact amount, the unique-code discount and a download button', async () => {
    render(<StorefrontQrisPayment payment={payment} orderNumber="KDM-26-11-26-007" customerName="Ani" />)
    expect(screen.getByText('Rp329.007')).toBeInTheDocument()
    expect(screen.getByText('Rp330.000')).toBeInTheDocument()
    expect(screen.getByText('−Rp993')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unduh QR' })).toBeEnabled()
    await waitFor(() => expect(screen.getByRole('img', { name: 'QRIS Rp329.007' }).querySelector('svg')).not.toBeNull())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('tells the customer when the amount was updated', () => {
    render(<StorefrontQrisPayment payment={{ ...payment, amountUpdated: true }} orderNumber="KDM-26-11-26-007" />)
    expect(screen.getByRole('status')).toHaveTextContent('Nominal diperbarui')
  })
})
