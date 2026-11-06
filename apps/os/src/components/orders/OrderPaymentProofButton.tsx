import { useState, type FC } from 'react'
import { FileImage } from 'lucide-react'
import { openOrderPaymentProof } from '../../data/orderMediaUpload'
import { useToast } from '../../hooks/use-toast'
import type { OrderTableRow } from '../../types/orders'

/** Roles Storage lets read a transfer proof (order_payment_proofs_storage_select). */
export const PAYMENT_PROOF_VIEWER_ROLES = ['owner', 'admin', 'finance'] as const

export const canViewPaymentProof = (role: string, order: Pick<OrderTableRow, 'paymentMethod' | 'paymentProofUrl'>): boolean =>
  (PAYMENT_PROOF_VIEWER_ROLES as readonly string[]).includes(role)
  && order.paymentMethod === 'transfer'
  && Boolean(order.paymentProofUrl)

/** Opens the private transfer proof in a new tab through a fresh signed link. */
export const OrderPaymentProofButton: FC<{ paymentProofPath: string }> = ({ paymentProofPath }) => {
  const { toast } = useToast()
  const [opening, setOpening] = useState(false)

  const open = async () => {
    setOpening(true)
    try {
      await openOrderPaymentProof(paymentProofPath)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Bukti transfer tidak bisa dibuka',
        description: error instanceof Error ? error.message : 'Coba lagi beberapa saat lagi.',
      })
    } finally {
      setOpening(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => { void open() }}
      disabled={opening}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-primary ring-1 ring-primary/25 transition hover:bg-primary/5 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <FileImage className="size-3.5" />
      {opening ? 'Membuka…' : 'Lihat bukti transfer'}
    </button>
  )
}
